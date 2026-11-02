import { randomUUID } from 'node:crypto';

import { RejectQuoteUseCase } from '@application/use-cases/quote/reject-quote.use-case';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { BadRequestException } from '@application/exceptions/bad-request.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../../helpers/unit-of-work-mock.factory';

describe('RejectQuoteUseCase', () => {
  const decidedBy = randomUUID();
  let useCase: RejectQuoteUseCase;
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

    useCase = new RejectQuoteUseCase(unitOfWork, logger, cache);
  });

  it('should record reason and author and write billing.quote.rejected with remainingSentCount', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });

    quoteRepository.findById.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      quote,
      createMockQuote({ workOrderId: quote.workOrderId, status: QuoteStatus.SENT }),
      createMockQuote({ workOrderId: quote.workOrderId }),
      createMockQuote({ workOrderId: quote.workOrderId, status: QuoteStatus.REJECTED }),
    ]);

    const result = await useCase.execute(quote.id, '  Preço acima do esperado  ', decidedBy);

    expect(result.status).toBe(QuoteStatus.REJECTED);
    expect(result.rejectionReason).toBe('Preço acima do esperado');
    expect(result.decidedBy).toBe(decidedBy);
    expect(quoteRepository.update).toHaveBeenCalledWith(quote);

    expect(outboxRepository.add).toHaveBeenCalledWith({
      type: 'billing.quote.rejected',
      workOrderId: quote.workOrderId,
      payload: {
        quoteId: quote.id,
        reason: 'Preço acima do esperado',
        remainingSentCount: 1,
        decidedBy,
      },
    });
  });

  it('should count zero remaining SENT quotes when the rejected one was the last', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });

    quoteRepository.findById.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([quote]);

    await useCase.execute(quote.id, 'Cliente desistiu', decidedBy);

    expect(outboxRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ remainingSentCount: 0 }) }),
    );
  });

  it.each([undefined, null, '', '   '])(
    'should refuse a rejection with reason %p with 400 before reading the quote',
    async (reason) => {
      await expect(useCase.execute('quote-id', reason, decidedBy)).rejects.toThrow(
        new BadRequestException('A justificativa é obrigatória para rejeitar um orçamento'),
      );

      expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
    },
  );

  it('should throw not found for an unknown quote', async () => {
    quoteRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('unknown-id', 'Motivo', decidedBy)).rejects.toThrow(
      new ResourceNotFoundException('Orçamento', 'unknown-id'),
    );

    expect(quoteRepository.update).not.toHaveBeenCalled();
  });

  it('should refuse with 409 when the quote is not SENT', async () => {
    quoteRepository.findById.mockResolvedValue(createMockQuote());

    await expect(useCase.execute('quote-id', 'Motivo', decidedBy)).rejects.toThrow(
      BusinessRuleViolationException,
    );

    expect(quoteRepository.update).not.toHaveBeenCalled();
    expect(outboxRepository.add).not.toHaveBeenCalled();
  });

  it('should delete the quote and work order list keys and log after the commit', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });

    quoteRepository.findById.mockResolvedValue(quote);

    await useCase.execute(quote.id, 'Motivo', decidedBy);

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);

    expect(outboxRepository.add.mock.invocationCallOrder[0]).toBeLessThan(
      cache.delete.mock.invocationCallOrder[0],
    );

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.QUOTE_REJECTED, {
      quoteId: quote.id,
      workOrderId: quote.workOrderId,
    });
  });

  it('should not touch the cache when the transaction fails', async () => {
    quoteRepository.findById.mockResolvedValue(createMockQuote({ status: QuoteStatus.SENT }));
    outboxRepository.add.mockRejectedValue(new Error('outbox down'));

    await expect(useCase.execute('quote-id', 'Motivo', decidedBy)).rejects.toThrow('outbox down');

    expect(cache.delete).not.toHaveBeenCalled();
    expect(logger.event).not.toHaveBeenCalled();
  });
});
