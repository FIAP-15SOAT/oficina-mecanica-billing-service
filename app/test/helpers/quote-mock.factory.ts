import { randomUUID } from 'node:crypto';
import { Quote } from '@domain/entities/quote.entity';
import { QuoteService } from '@domain/entities/quote-service.entity';
import { QuotePartSupply } from '@domain/entities/quote-part-supply.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

export function createMockQuote(overrides: Partial<Quote> = {}): Quote {
  const now = new Date();

  return Quote.reconstitute({
    id: randomUUID(),
    workOrderId: randomUUID(),
    status: QuoteStatus.PENDING,
    notes: null,
    servicesAmount: 0,
    partsAmount: 0,
    totalAmount: 0,
    version: 1,
    sentAt: null,
    approvedAt: null,
    rejectedAt: null,
    replacedByQuoteId: null,
    rejectionReason: null,
    decidedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function createMockQuoteService(overrides: Partial<QuoteService> = {}): QuoteService {
  return QuoteService.reconstitute({
    quoteId: randomUUID(),
    serviceId: randomUUID(),
    quantity: 1,
    unitPrice: 100,
    totalPrice: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

export function createMockQuotePartSupply(
  overrides: Partial<QuotePartSupply> = {},
): QuotePartSupply {
  return QuotePartSupply.reconstitute({
    quoteId: randomUUID(),
    partSupplyId: randomUUID(),
    quantity: 2,
    unitPrice: 50,
    totalPrice: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}
