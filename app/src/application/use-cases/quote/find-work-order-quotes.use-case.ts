import { Quote } from '@domain/entities/quote.entity';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import {
  CachedQuoteList,
  QUOTE_CACHE_VERSION,
  QuoteCacheMapper,
} from '@application/mappers/quote-cache.mapper';
import { IFindWorkOrderQuotesUseCase } from '@application/ports/input/quote/find-work-order-quotes.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class FindWorkOrderQuotesUseCase implements IFindWorkOrderQuotesUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly cache: ICache,
  ) {}

  async execute(workOrderId: string): Promise<Quote[]> {
    const cached = await this.findCachedQuotes(workOrderId);

    if (cached) {
      return cached;
    }

    const quotes = await this.quoteRepository.findByWorkOrderId(workOrderId);

    await this.cacheQuotes(workOrderId, quotes);

    return quotes;
  }

  private async findCachedQuotes(workOrderId: string): Promise<Quote[] | null> {
    const value = await this.cache.get(billingCacheKeys.workOrderQuotes(workOrderId));

    return value === null ? null : this.parseCachedQuotes(value);
  }

  // A value this code cannot read (corrupted or written by another version) is a miss.
  private parseCachedQuotes(value: string): Quote[] | null {
    try {
      const cached = JSON.parse(value) as CachedQuoteList;

      return cached.cacheVersion === QUOTE_CACHE_VERSION
        ? QuoteCacheMapper.listToDomain(cached)
        : null;
    } catch {
      return null;
    }
  }

  private async cacheQuotes(workOrderId: string, quotes: readonly Quote[]): Promise<void> {
    await this.cache.set(
      billingCacheKeys.workOrderQuotes(workOrderId),
      JSON.stringify(QuoteCacheMapper.listToCache(quotes)),
    );
  }
}
