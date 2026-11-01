import { randomUUID } from 'node:crypto';

import { ApproveQuoteUseCase } from '@application/use-cases/quote/approve-quote.use-case';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../../helpers/unit-of-work-mock.factory';
import { createMockWorkOrderGateway } from '../../../../helpers/work-order-gateway-mock.factory';

describe('ApproveQuoteUseCase', () => {
  const decidedBy = randomUUID();
  let useCase: ApproveQuoteUseCase;
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

    useCase = new ApproveQuoteUseCase(
      unitOfWork,
      new QuoteWorkOrderPolicy(createMockWorkOrderGateway()),
      logger,
      cache,
    );
  });

  it('should approve and reject PENDING and SENT quotes of the work order with the restore columns', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });
    const pending = createMockQuote({ workOrderId: quote.workOrderId });
    const sentAt = new Date('2026-10-30T12:00:00Z');
    const sent = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.SENT,
      sentAt,
    });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([quote, pending, sent]);

    const result = await useCase.execute(quote.id, decidedBy);

    expect(result).toBe(quote);
    expect(result.status).toBe(QuoteStatus.APPROVED);
    expect(result.decidedBy).toBe(decidedBy);
    expect(quoteRepository.findByWorkOrderId).toHaveBeenCalledWith(quote.workOrderId);

    for (const rejected of [pending, sent]) {
      expect(rejected.status).toBe(QuoteStatus.REJECTED);
      expect(rejected.replacedByQuoteId).toBe(quote.id);
      expect(quoteRepository.update).toHaveBeenCalledWith(rejected);
    }

    expect(pending.sentAt).toBeNull();
    expect(sent.sentAt).toBe(sentAt);
  });

  it('should write billing.quote.approved with items, total and author', async () => {
    const serviceId = randomUUID();
    const partSupplyId = randomUUID();
    const quote = Quote.create({
      workOrderId: randomUUID(),
      services: [{ serviceId, unitPrice: 0.1, quantity: 3 }],
      partsSupplies: [{ partSupplyId, unitPrice: 35.5, quantity: 2 }],
    });

    quote.submit();
    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    await useCase.execute(quote.id, decidedBy);

    expect(outboxRepository.add).toHaveBeenCalledWith({
      type: 'billing.quote.approved',
      workOrderId: quote.workOrderId,
      payload: {
        quoteId: quote.id,
        decidedBy,
        total: '71.30',
        services: [{ serviceId, quantity: 3, unitPrice: '0.10' }],
        partsSupplies: [{ partSupplyId, quantity: 2, unitPrice: '35.50' }],
      },
    });
  });

  it('should format a binary fraction total with two decimals', async () => {
    const quote = Quote.create({
      workOrderId: randomUUID(),
      services: [{ serviceId: randomUUID(), unitPrice: 0.1, quantity: 3 }],
    });

    quote.submit();
    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    await useCase.execute(quote.id, decidedBy);

    expect(outboxRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ total: '0.30' }) }),
    );
  });

  it('should write no billing.quote.rejected for the rejected quotes', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      quote,
      createMockQuote({ workOrderId: quote.workOrderId, status: QuoteStatus.SENT }),
    ]);

    await useCase.execute(quote.id, decidedBy);

    expect(outboxRepository.add).toHaveBeenCalledTimes(1);
    expect(outboxRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'billing.quote.approved' }),
    );
  });

  it('should refuse with 409 when another quote of the work order is APPROVED', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      quote,
      createMockQuote({ workOrderId: quote.workOrderId, status: QuoteStatus.APPROVED }),
    ]);

    await expect(useCase.execute(quote.id, decidedBy)).rejects.toThrow(
      new ResourceConflictException('A ordem de serviço já tem um orçamento aprovado'),
    );

    expect(quote.status).toBe(QuoteStatus.SENT);
    expect(quoteRepository.update).not.toHaveBeenCalled();
    expect(outboxRepository.add).not.toHaveBeenCalled();
  });

  it('should refuse with 409 when the quote is not SENT', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());

    await expect(useCase.execute('quote-id', decidedBy)).rejects.toThrow(
      BusinessRuleViolationException,
    );

    expect(quoteRepository.update).not.toHaveBeenCalled();
    expect(outboxRepository.add).not.toHaveBeenCalled();
  });

  it('should throw not found for an unknown quote', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(null);

    await expect(useCase.execute('unknown-id', decidedBy)).rejects.toThrow(
      new ResourceNotFoundException('Orçamento', 'unknown-id'),
    );

    expect(quoteRepository.findByWorkOrderId).not.toHaveBeenCalled();
  });

  it('should leave REJECTED quotes of the work order untouched', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });
    const rejected = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
    });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([quote, rejected]);

    await useCase.execute(quote.id, decidedBy);

    expect(rejected.replacedByQuoteId).toBeNull();
    expect(quoteRepository.update).toHaveBeenCalledTimes(1);
    expect(quoteRepository.update).toHaveBeenCalledWith(quote);
  });

  it('should update the quotes one at a time in id order before writing the message', async () => {
    const workOrderId = randomUUID();
    const quote = createMockQuote({
      id: '22222222-2222-4222-8222-222222222222',
      workOrderId,
      status: QuoteStatus.SENT,
    });
    const higher = createMockQuote({
      id: '33333333-3333-4333-8333-333333333333',
      workOrderId,
      status: QuoteStatus.SENT,
    });
    const lower = createMockQuote({ id: '11111111-1111-4111-8111-111111111111', workOrderId });
    let pendingUpdates = 0;

    quoteRepository.update.mockImplementation(async (changed) => {
      pendingUpdates += 1;
      expect(pendingUpdates).toBe(1);
      await Promise.resolve();
      pendingUpdates -= 1;

      return changed;
    });
    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([higher, quote, lower]);

    await useCase.execute(quote.id, decidedBy);

    expect(quoteRepository.update.mock.calls.map(([changed]) => changed.id)).toEqual([
      lower.id,
      quote.id,
      higher.id,
    ]);
    expect(quoteRepository.update.mock.invocationCallOrder.at(-1)).toBeLessThan(
      outboxRepository.add.mock.invocationCallOrder[0],
    );
  });

  it('should refuse with 409 and write no message when a quote changed after the read', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });
    const conflict = new ConcurrencyException(
      'Orçamento foi modificado por outra operação. Tente novamente',
    );

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.update.mockRejectedValue(conflict);

    await expect(useCase.execute(quote.id, decidedBy)).rejects.toThrow(conflict);

    expect(outboxRepository.add).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
    expect(logger.event).not.toHaveBeenCalled();
  });

  it('should delete the keys of the quote, of each rejected quote and of the list after the commit', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });
    const sent = createMockQuote({ workOrderId: quote.workOrderId, status: QuoteStatus.SENT });
    const rejected = createMockQuote({
      workOrderId: quote.workOrderId,
      status: QuoteStatus.REJECTED,
    });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([quote, sent, rejected]);

    await useCase.execute(quote.id, decidedBy);

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:quote:${sent.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);
    expect(outboxRepository.add.mock.invocationCallOrder[0]).toBeLessThan(
      cache.delete.mock.invocationCallOrder[0],
    );
    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.QUOTE_APPROVED, {
      quoteId: quote.id,
      workOrderId: quote.workOrderId,
    });
  });
});
