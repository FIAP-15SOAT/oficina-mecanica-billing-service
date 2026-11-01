import { FindWorkOrderQuotesUseCase } from '@application/use-cases/quote/find-work-order-quotes.use-case';
import { QuoteCacheMapper } from '@application/mappers/quote-cache.mapper';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

describe('FindWorkOrderQuotesUseCase', () => {
  const workOrderId = '6f1c2b9e-4d3a-4e8b-9c7d-2a1b3c4d5e6f';

  let useCase: FindWorkOrderQuotesUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();

    cache = createMockCache();
    cache.get.mockResolvedValue(null);

    useCase = new FindWorkOrderQuotesUseCase(quoteRepository, cache);
  });

  it('should return the cached quotes without reading the database', async () => {
    const quotes = [createMockQuote({ workOrderId }), createMockQuote({ workOrderId })];

    cache.get.mockResolvedValue(JSON.stringify(QuoteCacheMapper.listToCache(quotes)));

    await expect(useCase.execute(workOrderId)).resolves.toEqual(quotes);
    expect(cache.get).toHaveBeenCalledWith(`billing:work-order-quotes:${workOrderId}`);
    expect(quoteRepository.findByWorkOrderId).not.toHaveBeenCalled();
  });

  it('should read the database and cache on a miss', async () => {
    const quotes = [createMockQuote({ workOrderId })];

    quoteRepository.findByWorkOrderId.mockResolvedValue(quotes);

    await expect(useCase.execute(workOrderId)).resolves.toBe(quotes);

    expect(cache.set).toHaveBeenCalledWith(
      `billing:work-order-quotes:${workOrderId}`,
      JSON.stringify(QuoteCacheMapper.listToCache(quotes)),
    );
  });

  it('should treat a value of another cache version as a miss', async () => {
    cache.get.mockResolvedValue(JSON.stringify({ cacheVersion: 0, quotes: [] }));
    quoteRepository.findByWorkOrderId.mockResolvedValue([]);

    await expect(useCase.execute(workOrderId)).resolves.toEqual([]);
    expect(quoteRepository.findByWorkOrderId).toHaveBeenCalledWith(workOrderId);
  });

  it('should treat an unreadable value as a miss', async () => {
    cache.get.mockResolvedValue('{not json');
    quoteRepository.findByWorkOrderId.mockResolvedValue([]);

    await expect(useCase.execute(workOrderId)).resolves.toEqual([]);
    expect(quoteRepository.findByWorkOrderId).toHaveBeenCalledWith(workOrderId);
  });
});
