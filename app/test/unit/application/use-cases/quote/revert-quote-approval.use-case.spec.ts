import { randomUUID } from 'node:crypto';

import { RevertQuoteApprovalUseCase } from '@application/use-cases/quote/revert-quote-approval.use-case';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../../helpers/unit-of-work-mock.factory';

describe('RevertQuoteApprovalUseCase', () => {
  let useCase: RevertQuoteApprovalUseCase;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let outboxRepository: jest.Mocked<IOutboxRepository>;
  let logger: jest.Mocked<ILogger>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;

    quoteRepository = mock.repos.quote as jest.Mocked<IQuoteRepository>;
    quoteRepository.findByWorkOrderId.mockResolvedValue([]);
    quoteRepository.update.mockImplementation((quote) => Promise.resolve(quote));

    outboxRepository = mock.repos.outbox as jest.Mocked<IOutboxRepository>;

    logger = createMockLogger();

    cache = createMockCache();

    useCase = new RevertQuoteApprovalUseCase(unitOfWork, logger, cache);
  });

  it.each([QuoteStatus.SENT, QuoteStatus.REJECTED] as const)(
    'should revert an APPROVED quote to %s and write billing.quote.approval_reverted',
    async (revertTo) => {
      const quote = createMockQuote({
        status: QuoteStatus.APPROVED,
        approvedAt: new Date(),
        decidedBy: randomUUID(),
      });

      quoteRepository.findById.mockResolvedValue(quote);
      quoteRepository.findByWorkOrderId.mockResolvedValue([quote]);

      await useCase.execute(quote.id, revertTo);

      expect(quote.status).toBe(revertTo);
      expect(quote.approvedAt).toBeNull();
      expect(quote.decidedBy).toBeNull();
      expect(quoteRepository.update).toHaveBeenCalledWith(quote);

      expect(outboxRepository.add).toHaveBeenCalledWith({
        type: 'billing.quote.approval_reverted',
        workOrderId: quote.workOrderId,
        payload: { quoteId: quote.id, revertTo },
      });

      expect(quoteRepository.update.mock.invocationCallOrder[0]).toBeLessThan(
        outboxRepository.add.mock.invocationCallOrder[0],
      );
    },
  );

  it('should restore only the quotes this quote rejected', async () => {
    const quote = createMockQuote({ status: QuoteStatus.APPROVED });

    const rejectedWhilePending = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
      replacedByQuoteId: quote.id,
      rejectedAt: new Date(),
    });

    const rejectedWhileSent = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
      replacedByQuoteId: quote.id,
      sentAt: new Date(),
      rejectedAt: new Date(),
    });

    const rejectedByAnotherApproval = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
      replacedByQuoteId: randomUUID(),
    });

    const rejectedByCustomer = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
    });

    quoteRepository.findById.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      quote,
      rejectedWhilePending,
      rejectedWhileSent,
      rejectedByAnotherApproval,
      rejectedByCustomer,
    ]);

    await useCase.execute(quote.id, QuoteStatus.SENT);

    expect(quoteRepository.findByWorkOrderId).toHaveBeenCalledWith(quote.workOrderId);
    expect(rejectedWhilePending.status).toBe(QuoteStatus.PENDING);
    expect(rejectedWhileSent.status).toBe(QuoteStatus.SENT);

    for (const restored of [rejectedWhilePending, rejectedWhileSent]) {
      expect(restored.replacedByQuoteId).toBeNull();
      expect(restored.rejectedAt).toBeNull();
    }

    expect(rejectedByAnotherApproval.status).toBe(QuoteStatus.REJECTED);
    expect(rejectedByCustomer.status).toBe(QuoteStatus.REJECTED);
    expect(quoteRepository.update).toHaveBeenCalledTimes(3);
    expect(quoteRepository.update).not.toHaveBeenCalledWith(rejectedByAnotherApproval);
    expect(quoteRepository.update).not.toHaveBeenCalledWith(rejectedByCustomer);
  });

  it('should update the quotes one at a time in id order before writing the message', async () => {
    const workOrderId = randomUUID();

    const quote = createMockQuote({
      id: '22222222-2222-4222-8222-222222222222',
      workOrderId,
      status: QuoteStatus.APPROVED,
    });

    const higher = createMockQuote({
      id: '33333333-3333-4333-8333-333333333333',
      workOrderId,
      status: QuoteStatus.REJECTED,
      replacedByQuoteId: quote.id,
    });

    const lower = createMockQuote({
      id: '11111111-1111-4111-8111-111111111111',
      workOrderId,
      status: QuoteStatus.REJECTED,
      replacedByQuoteId: quote.id,
    });

    let pendingUpdates = 0;

    quoteRepository.update.mockImplementation(async (changed) => {
      pendingUpdates += 1;
      expect(pendingUpdates).toBe(1);
      await Promise.resolve();
      pendingUpdates -= 1;

      return changed;
    });

    quoteRepository.findById.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([higher, quote, lower]);

    await useCase.execute(quote.id, QuoteStatus.SENT);

    expect(quoteRepository.update.mock.calls.map(([changed]) => changed.id)).toEqual([
      lower.id,
      quote.id,
      higher.id,
    ]);

    expect(quoteRepository.update.mock.invocationCallOrder.at(-1)).toBeLessThan(
      outboxRepository.add.mock.invocationCallOrder[0],
    );
  });

  it.each([QuoteStatus.SENT, QuoteStatus.REJECTED, QuoteStatus.PENDING])(
    'should skip a %s quote without writing',
    async (status) => {
      const quote = createMockQuote({ status });

      quoteRepository.findById.mockResolvedValue(quote);

      await useCase.execute(quote.id, QuoteStatus.SENT);

      expect(quote.status).toBe(status);
      expect(quoteRepository.findByWorkOrderId).not.toHaveBeenCalled();
      expect(quoteRepository.update).not.toHaveBeenCalled();
      expect(outboxRepository.add).not.toHaveBeenCalled();
      expect(cache.delete).not.toHaveBeenCalled();

      expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.QUOTE_APPROVAL_REVERT_SKIPPED, {
        quoteId: quote.id,
        quoteStatus: status,
      });
    },
  );

  it('should skip an unknown quote without writing', async () => {
    const quoteId = randomUUID();

    quoteRepository.findById.mockResolvedValue(null);

    await useCase.execute(quoteId, QuoteStatus.REJECTED);

    expect(quoteRepository.update).not.toHaveBeenCalled();
    expect(outboxRepository.add).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.QUOTE_APPROVAL_REVERT_SKIPPED, {
      quoteId,
      quoteStatus: undefined,
    });
  });

  it('should write no message and delete no key when a quote changed after the read', async () => {
    const quote = createMockQuote({ status: QuoteStatus.APPROVED });

    const conflict = new ConcurrencyException(
      'Orçamento foi modificado por outra operação. Tente novamente',
    );

    quoteRepository.findById.mockResolvedValue(quote);
    quoteRepository.update.mockRejectedValue(conflict);

    await expect(useCase.execute(quote.id, QuoteStatus.SENT)).rejects.toThrow(conflict);

    expect(outboxRepository.add).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
    expect(logger.event).not.toHaveBeenCalled();
  });

  it('should delete the keys of the quote, of each restored quote and of the list after the commit', async () => {
    const quote = createMockQuote({ status: QuoteStatus.APPROVED });

    const restored = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
      replacedByQuoteId: quote.id,
    });

    const rejectedByCustomer = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
    });

    quoteRepository.findById.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([quote, restored, rejectedByCustomer]);

    await useCase.execute(quote.id, QuoteStatus.REJECTED);

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:quote:${restored.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);

    expect(outboxRepository.add.mock.invocationCallOrder[0]).toBeLessThan(
      cache.delete.mock.invocationCallOrder[0],
    );

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.QUOTE_APPROVAL_REVERTED, {
      quoteId: quote.id,
      quoteStatus: QuoteStatus.REJECTED,
    });
  });
});
