import { DeleteQuoteUseCase } from '@application/use-cases/quote/delete-quote.use-case';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';

describe('DeleteQuoteUseCase', () => {
  let useCase: DeleteQuoteUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();

    cache = createMockCache();

    useCase = new DeleteQuoteUseCase(quoteRepository, cache);
  });

  it('should delete a PENDING quote', async () => {
    const quote = createMockQuote();

    quoteRepository.findById.mockResolvedValue(quote);

    await useCase.execute(quote.id);

    expect(quoteRepository.delete).toHaveBeenCalledWith(quote.id);
  });

  it('should refuse to delete a quote outside PENDING with 409', async () => {
    quoteRepository.findById.mockResolvedValue(createMockQuote({ status: QuoteStatus.SENT }));

    await expect(useCase.execute('quote-id')).rejects.toThrow(
      new BusinessRuleViolationException(
        'Orçamento só pode ser apagado se estiver no status PENDING. Status atual: "SENT"',
      ),
    );

    expect(quoteRepository.delete).not.toHaveBeenCalled();
  });

  it('should answer not found for an unknown quote', async () => {
    quoteRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('unknown-id')).rejects.toThrow(
      new ResourceNotFoundException('Orçamento', 'unknown-id'),
    );

    expect(quoteRepository.delete).not.toHaveBeenCalled();
  });

  it('should delete the quote and work order list keys after the deletion', async () => {
    const quote = createMockQuote();

    quoteRepository.findById.mockResolvedValue(quote);

    await useCase.execute(quote.id);

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);
  });

  it('should not touch the cache when the deletion fails', async () => {
    quoteRepository.findById.mockResolvedValue(createMockQuote());
    quoteRepository.delete.mockRejectedValue(new Error('database down'));

    await expect(useCase.execute('quote-id')).rejects.toThrow('database down');
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
