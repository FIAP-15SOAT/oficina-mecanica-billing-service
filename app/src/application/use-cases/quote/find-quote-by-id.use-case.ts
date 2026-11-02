import { Quote } from '@domain/entities/quote.entity';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import {
  CachedQuote,
  QUOTE_CACHE_VERSION,
  QuoteCacheMapper,
} from '@application/mappers/quote-cache.mapper';
import { IFindQuoteByIdUseCase } from '@application/ports/input/quote/find-quote-by-id.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class FindQuoteByIdUseCase implements IFindQuoteByIdUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly cache: ICache,
  ) {}

  async execute(id: string): Promise<Quote> {
    const cached = await this.findCachedQuote(id);

    if (cached) {
      return cached;
    }

    const quote = await this.quoteRepository.findByIdWithDetails(id);

    if (!quote) {
      throw new ResourceNotFoundException('Orçamento', id);
    }

    await this.cacheQuote(quote);

    return quote;
  }

  private async findCachedQuote(id: string): Promise<Quote | null> {
    const value = await this.cache.get(billingCacheKeys.quote(id));

    return value === null ? null : this.parseCachedQuote(value);
  }

  // A value this code cannot read (corrupted or written by another version) is a miss.
  private parseCachedQuote(value: string): Quote | null {
    try {
      const cached = JSON.parse(value) as CachedQuote;

      return cached.cacheVersion === QUOTE_CACHE_VERSION ? QuoteCacheMapper.toDomain(cached) : null;
    } catch {
      return null;
    }
  }

  private async cacheQuote(quote: Quote): Promise<void> {
    await this.cache.set(
      billingCacheKeys.quote(quote.id),
      JSON.stringify(QuoteCacheMapper.toCache(quote)),
    );
  }
}
