import { randomUUID } from 'node:crypto';
import { Prisma } from '@generated/client';

import { QuoteServiceMapper } from '@infrastructure/persistence/prisma/mappers/quote-service.mapper';

describe('QuoteServiceMapper', () => {
  it('should map a Prisma record to a domain entity', () => {
    const now = new Date();

    const record = {
      quoteId: randomUUID(),
      serviceId: randomUUID(),
      quantity: 2,
      unitPrice: new Prisma.Decimal(150),
      totalPrice: new Prisma.Decimal(300),
      createdAt: now,
      updatedAt: now,
    };

    const item = QuoteServiceMapper.toDomain(record);

    expect(item.quoteId).toBe(record.quoteId);
    expect(item.serviceId).toBe(record.serviceId);
    expect(item.quantity).toBe(2);
    expect(item.unitPrice).toBe(150);
    expect(item.totalPrice).toBe(300);
    expect(item.createdAt).toBe(now);
    expect(item.updatedAt).toBe(now);
  });
});
