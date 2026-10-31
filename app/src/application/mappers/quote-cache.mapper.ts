import { Quote } from '@domain/entities/quote.entity';
import { QuotePartSupply } from '@domain/entities/quote-part-supply.entity';
import { QuoteService } from '@domain/entities/quote-service.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

// Bump when the cached shape changes: values written by the previous code then read as misses.
export const QUOTE_CACHE_VERSION = 1;

interface CachedQuoteItem {
  quoteId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
}

interface CachedQuoteService extends CachedQuoteItem {
  serviceId: string;
}

interface CachedQuotePartSupply extends CachedQuoteItem {
  partSupplyId: string;
}

export interface CachedQuote {
  cacheVersion: number;
  id: string;
  workOrderId: string;
  status: QuoteStatus;
  notes: string | null;
  servicesAmount: number;
  partsAmount: number;
  totalAmount: number;
  version: number;
  sentAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  replacedByQuoteId: string | null;
  rejectionReason: string | null;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
  services: CachedQuoteService[];
  partsSupplies: CachedQuotePartSupply[];
}

export interface CachedQuoteList {
  cacheVersion: number;
  quotes: CachedQuote[];
}

export class QuoteCacheMapper {
  static toCache(quote: Quote): CachedQuote {
    return {
      cacheVersion: QUOTE_CACHE_VERSION,
      id: quote.id,
      workOrderId: quote.workOrderId,
      status: quote.status,
      notes: quote.notes,
      servicesAmount: quote.servicesAmount,
      partsAmount: quote.partsAmount,
      totalAmount: quote.totalAmount,
      version: quote.version,
      sentAt: QuoteCacheMapper.toIso(quote.sentAt),
      approvedAt: QuoteCacheMapper.toIso(quote.approvedAt),
      rejectedAt: QuoteCacheMapper.toIso(quote.rejectedAt),
      replacedByQuoteId: quote.replacedByQuoteId,
      rejectionReason: quote.rejectionReason,
      decidedBy: quote.decidedBy,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
      services: quote.services.map((item) => ({
        serviceId: item.serviceId,
        ...QuoteCacheMapper.toCachedItem(item),
      })),
      partsSupplies: quote.partsSupplies.map((item) => ({
        partSupplyId: item.partSupplyId,
        ...QuoteCacheMapper.toCachedItem(item),
      })),
    };
  }

  static toDomain(cached: CachedQuote): Quote {
    return Quote.reconstitute({
      id: cached.id,
      workOrderId: cached.workOrderId,
      status: cached.status,
      notes: cached.notes,
      servicesAmount: cached.servicesAmount,
      partsAmount: cached.partsAmount,
      totalAmount: cached.totalAmount,
      version: cached.version,
      sentAt: QuoteCacheMapper.toDate(cached.sentAt),
      approvedAt: QuoteCacheMapper.toDate(cached.approvedAt),
      rejectedAt: QuoteCacheMapper.toDate(cached.rejectedAt),
      replacedByQuoteId: cached.replacedByQuoteId,
      rejectionReason: cached.rejectionReason,
      decidedBy: cached.decidedBy,
      createdAt: new Date(cached.createdAt),
      updatedAt: new Date(cached.updatedAt),
      services: cached.services.map((item) =>
        QuoteService.reconstitute({
          ...QuoteCacheMapper.fromCachedItem(item),
          serviceId: item.serviceId,
        }),
      ),
      partsSupplies: cached.partsSupplies.map((item) =>
        QuotePartSupply.reconstitute({
          ...QuoteCacheMapper.fromCachedItem(item),
          partSupplyId: item.partSupplyId,
        }),
      ),
    });
  }

  static listToCache(quotes: readonly Quote[]): CachedQuoteList {
    return {
      cacheVersion: QUOTE_CACHE_VERSION,
      quotes: quotes.map((quote) => QuoteCacheMapper.toCache(quote)),
    };
  }

  static listToDomain(cached: CachedQuoteList): Quote[] {
    return cached.quotes.map((quote) => QuoteCacheMapper.toDomain(quote));
  }

  private static toCachedItem(item: QuoteService | QuotePartSupply): CachedQuoteItem {
    return {
      quoteId: item.quoteId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private static fromCachedItem(item: CachedQuoteItem) {
    return {
      quoteId: item.quoteId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    };
  }

  private static toIso(date: Date | null): string | null {
    return date === null ? null : date.toISOString();
  }

  private static toDate(value: string | null): Date | null {
    return value === null ? null : new Date(value);
  }
}
