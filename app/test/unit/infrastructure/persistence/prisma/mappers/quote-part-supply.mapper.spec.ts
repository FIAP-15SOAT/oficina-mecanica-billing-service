import { randomUUID } from 'node:crypto';
import { Prisma } from '@generated/client';

import { QuotePartSupplyMapper } from '@infrastructure/persistence/prisma/mappers/quote-part-supply.mapper';

describe('QuotePartSupplyMapper', () => {
  it('should map a Prisma record to a domain entity', () => {
    const now = new Date();
    const record = {
      quoteId: randomUUID(),
      partSupplyId: randomUUID(),
      quantity: 2,
      unitPrice: new Prisma.Decimal(150),
      totalPrice: new Prisma.Decimal(300),
      createdAt: now,
      updatedAt: now,
    };

    const item = QuotePartSupplyMapper.toDomain(record);

    expect(item.quoteId).toBe(record.quoteId);
    expect(item.partSupplyId).toBe(record.partSupplyId);
    expect(item.quantity).toBe(2);
    expect(item.unitPrice).toBe(150);
    expect(item.totalPrice).toBe(300);
    expect(item.createdAt).toBe(now);
    expect(item.updatedAt).toBe(now);
  });
});
