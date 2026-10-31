import { randomUUID } from 'node:crypto';
import { Prisma } from '@generated/client';

import {
  PrismaQuoteWithItems,
  QuoteMapper,
} from '@infrastructure/persistence/prisma/mappers/quote.mapper';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

function makeRecord(overrides: Partial<PrismaQuoteWithItems> = {}): PrismaQuoteWithItems {
  const now = new Date();
  return {
    id: randomUUID(),
    workOrderId: randomUUID(),
    servicesAmount: new Prisma.Decimal(150),
    partsAmount: new Prisma.Decimal(50),
    totalAmount: new Prisma.Decimal(200),
    version: 3,
    status: QuoteStatus.REJECTED,
    notes: 'Some notes',
    sentAt: now,
    approvedAt: null,
    rejectedAt: now,
    replacedByQuoteId: randomUUID(),
    rejectionReason: null,
    decidedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('QuoteMapper', () => {
  it('should map a Prisma record without items to a domain entity', () => {
    const record = makeRecord();

    const quote = QuoteMapper.toDomain(record);

    expect(quote.id).toBe(record.id);
    expect(quote.workOrderId).toBe(record.workOrderId);
    expect(quote.servicesAmount).toBe(150);
    expect(quote.partsAmount).toBe(50);
    expect(quote.totalAmount).toBe(200);
    expect(quote.version).toBe(3);
    expect(quote.status).toBe(QuoteStatus.REJECTED);
    expect(quote.notes).toBe('Some notes');
    expect(quote.rejectedAt).toBe(record.rejectedAt);
    expect(quote.replacedByQuoteId).toBe(record.replacedByQuoteId);
    expect(quote.rejectionReason).toBeNull();
    expect(quote.decidedBy).toBeNull();
    expect(quote.services).toEqual([]);
    expect(quote.partsSupplies).toEqual([]);
  });

  it('should map the items when the record includes them', () => {
    const now = new Date();

    const record = makeRecord({
      status: QuoteStatus.APPROVED,
      decidedBy: randomUUID(),
      services: [
        {
          quoteId: randomUUID(),
          serviceId: randomUUID(),
          quantity: 1,
          unitPrice: new Prisma.Decimal(150),
          totalPrice: new Prisma.Decimal(150),
          createdAt: now,
          updatedAt: now,
        },
      ],
      partsSupplies: [
        {
          quoteId: randomUUID(),
          partSupplyId: randomUUID(),
          quantity: 2,
          unitPrice: new Prisma.Decimal(25),
          totalPrice: new Prisma.Decimal(50),
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const quote = QuoteMapper.toDomain(record);

    expect(quote.decidedBy).toBe(record.decidedBy);
    expect(quote.services).toHaveLength(1);
    expect(quote.services[0].unitPrice).toBe(150);
    expect(quote.partsSupplies).toHaveLength(1);
    expect(quote.partsSupplies[0].totalPrice).toBe(50);
  });
});
