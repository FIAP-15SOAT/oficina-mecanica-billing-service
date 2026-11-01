import { RemoveQuoteServiceUseCase } from '@application/use-cases/quote/remove-quote-service.use-case';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { EntityNotFoundException } from '@domain/exceptions/entity-not-found.exception';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockQuote, createMockQuoteService } from '../../../../helpers/quote-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../../helpers/unit-of-work-mock.factory';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

describe('RemoveQuoteServiceUseCase', () => {
  let useCase: RemoveQuoteServiceUseCase;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;

    quoteRepository = mock.repos.quote as jest.Mocked<IQuoteRepository>;
    quoteRepository.update.mockImplementation((quote) => Promise.resolve(quote));

    cache = createMockCache();

    useCase = new RemoveQuoteServiceUseCase(unitOfWork, cache);
  });

  it('should remove the service and recalculate the totals', async () => {
    const item = createMockQuoteService({ quantity: 1, unitPrice: 100, totalPrice: 100 });
    const quote = createMockQuote({ services: [item], servicesAmount: 100, totalAmount: 100 });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    const result = await useCase.execute(quote.id, item.serviceId);

    expect(quoteRepository.removeServiceItem).toHaveBeenCalledWith(quote.id, item.serviceId);
    expect(result.servicesAmount).toBe(0);
  });

  it('should throw not found for an unknown quote', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(null);

    await expect(useCase.execute('unknown-id', 'any')).rejects.toThrow(
      new ResourceNotFoundException('Orçamento', 'unknown-id'),
    );
  });

  it('should refuse a quote that is not pending', async () => {
    const item = createMockQuoteService();

    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({ status: QuoteStatus.SENT, services: [item] }),
    );

    await expect(useCase.execute('quote-id', item.serviceId)).rejects.toThrow(
      BusinessRuleViolationException,
    );
  });

  it('should throw not found for a service that is not in the quote', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());

    await expect(useCase.execute('quote-id', 'missing-id')).rejects.toThrow(
      EntityNotFoundException,
    );
  });

  it('should delete the quote and work order list keys after the commit', async () => {
    const item = createMockQuoteService();
    const quote = createMockQuote({ services: [item] });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    await useCase.execute(quote.id, item.serviceId);

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);
  });

  it('should not touch the cache when the transaction fails', async () => {
    const item = createMockQuoteService();

    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote({ services: [item] }));
    quoteRepository.update.mockRejectedValue(new Error('version conflict'));

    await expect(useCase.execute('quote-id', item.serviceId)).rejects.toThrow('version conflict');
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
