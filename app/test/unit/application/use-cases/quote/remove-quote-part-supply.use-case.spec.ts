import { RemoveQuotePartSupplyUseCase } from '@application/use-cases/quote/remove-quote-part-supply.use-case';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { EntityNotFoundException } from '@domain/exceptions/entity-not-found.exception';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockQuote, createMockQuotePartSupply } from '../../../../helpers/quote-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../../helpers/unit-of-work-mock.factory';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

describe('RemoveQuotePartSupplyUseCase', () => {
  let useCase: RemoveQuotePartSupplyUseCase;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;
    quoteRepository = mock.repos.quote as jest.Mocked<IQuoteRepository>;
    quoteRepository.update.mockImplementation((quote) => Promise.resolve(quote));
    cache = createMockCache();
    useCase = new RemoveQuotePartSupplyUseCase(unitOfWork, cache);
  });

  it('should remove the part supply and recalculate the totals', async () => {
    const item = createMockQuotePartSupply({ quantity: 1, unitPrice: 100, totalPrice: 100 });
    const quote = createMockQuote({ partsSupplies: [item], partsAmount: 100, totalAmount: 100 });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    const result = await useCase.execute(quote.id, item.partSupplyId);

    expect(quoteRepository.removePartSupplyItem).toHaveBeenCalledWith(quote.id, item.partSupplyId);
    expect(result.partsAmount).toBe(0);
  });

  it('should throw not found for an unknown quote', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(null);

    await expect(useCase.execute('unknown-id', 'any')).rejects.toThrow(
      new ResourceNotFoundException('Orçamento', 'unknown-id'),
    );
  });

  it('should refuse a quote that is not pending', async () => {
    const item = createMockQuotePartSupply();

    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({ status: QuoteStatus.SENT, partsSupplies: [item] }),
    );

    await expect(useCase.execute('quote-id', item.partSupplyId)).rejects.toThrow(
      BusinessRuleViolationException,
    );
  });

  it('should throw not found for a part supply that is not in the quote', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());

    await expect(useCase.execute('quote-id', 'missing-id')).rejects.toThrow(
      EntityNotFoundException,
    );
  });

  it('should delete the quote and work order list keys after the commit', async () => {
    const item = createMockQuotePartSupply();
    const quote = createMockQuote({ partsSupplies: [item] });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    await useCase.execute(quote.id, item.partSupplyId);

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);
  });

  it('should not touch the cache when the transaction fails', async () => {
    const item = createMockQuotePartSupply();

    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({ partsSupplies: [item] }),
    );
    quoteRepository.update.mockRejectedValue(new Error('version conflict'));

    await expect(useCase.execute('quote-id', item.partSupplyId)).rejects.toThrow(
      'version conflict',
    );
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
