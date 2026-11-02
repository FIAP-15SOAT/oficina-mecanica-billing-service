import { QUOTE_CACHE_VERSION, QuoteCacheMapper } from '@application/mappers/quote-cache.mapper';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

import {
  createMockQuote,
  createMockQuotePartSupply,
  createMockQuoteService,
} from '../../../helpers/quote-mock.factory';

describe('QuoteCacheMapper', () => {
  const decided = createMockQuote({
    status: QuoteStatus.REJECTED,
    sentAt: new Date('2026-10-20T10:00:00.000Z'),
    approvedAt: new Date('2026-10-21T10:00:00.000Z'),
    rejectedAt: new Date('2026-10-22T10:00:00.000Z'),
    rejectionReason: 'Muito caro',
    decidedBy: 'customer-id',
    services: [createMockQuoteService()],
    partsSupplies: [createMockQuotePartSupply()],
  });

  it('should restore a quote with its items and dates through JSON', () => {
    const cached = JSON.parse(JSON.stringify(QuoteCacheMapper.toCache(decided))) as ReturnType<
      typeof QuoteCacheMapper.toCache
    >;

    expect(cached.cacheVersion).toBe(QUOTE_CACHE_VERSION);
    expect(QuoteCacheMapper.toDomain(cached)).toEqual(decided);
  });

  it('should restore a list of quotes through JSON', () => {
    const quotes = [decided, createMockQuote()];

    const cached = JSON.parse(JSON.stringify(QuoteCacheMapper.listToCache(quotes))) as ReturnType<
      typeof QuoteCacheMapper.listToCache
    >;

    expect(cached.cacheVersion).toBe(QUOTE_CACHE_VERSION);
    expect(QuoteCacheMapper.listToDomain(cached)).toEqual(quotes);
  });
});
