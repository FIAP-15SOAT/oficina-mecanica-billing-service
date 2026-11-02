import { FindQuoteByIdUseCase } from '@application/use-cases/quote/find-quote-by-id.use-case';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { QuoteCacheMapper } from '@application/mappers/quote-cache.mapper';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockQuote, createMockQuoteService } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

describe('FindQuoteByIdUseCase', () => {
  let useCase: FindQuoteByIdUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();

    cache = createMockCache();
    cache.get.mockResolvedValue(null);

    useCase = new FindQuoteByIdUseCase(quoteRepository, cache);
  });

  it('should return the cached quote without reading the database', async () => {
    const quote = createMockQuote({ services: [createMockQuoteService()] });

    cache.get.mockResolvedValue(JSON.stringify(QuoteCacheMapper.toCache(quote)));

    await expect(useCase.execute(quote.id)).resolves.toEqual(quote);
    expect(cache.get).toHaveBeenCalledWith(`billing:quote:${quote.id}`);
    expect(quoteRepository.findByIdWithDetails).not.toHaveBeenCalled();
  });

  it('should read the database and cache on a miss', async () => {
    const quote = createMockQuote();

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    await expect(useCase.execute(quote.id)).resolves.toBe(quote);

    expect(cache.set).toHaveBeenCalledWith(
      `billing:quote:${quote.id}`,
      JSON.stringify(QuoteCacheMapper.toCache(quote)),
    );
  });

  it('should treat a value of another cache version as a miss', async () => {
    const quote = createMockQuote();

    cache.get.mockResolvedValue(
      JSON.stringify({ ...QuoteCacheMapper.toCache(quote), cacheVersion: 0 }),
    );
    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    await expect(useCase.execute(quote.id)).resolves.toBe(quote);
    expect(quoteRepository.findByIdWithDetails).toHaveBeenCalledWith(quote.id);
  });

  it('should treat an unreadable value as a miss', async () => {
    const quote = createMockQuote();

    cache.get.mockResolvedValue('{not json');
    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);

    await expect(useCase.execute(quote.id)).resolves.toBe(quote);
  });

  it('should throw not found for an unknown quote and cache nothing', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(null);

    await expect(useCase.execute('unknown-id')).rejects.toThrow(
      new ResourceNotFoundException('Orçamento', 'unknown-id'),
    );

    expect(cache.set).not.toHaveBeenCalled();
  });
});
