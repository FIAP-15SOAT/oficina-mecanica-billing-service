import { randomUUID } from 'node:crypto';
import { Prisma } from '@generated/client';

import { PaymentMapper } from '@infrastructure/persistence/prisma/mappers/payment.mapper';
import { PaymentStatus } from '@domain/enums/payment-status.enum';

describe('PaymentMapper', () => {
  it('should map the record with the amount as number', () => {
    const now = new Date();

    const record = {
      id: randomUUID(),
      workOrderId: randomUUID(),
      amount: new Prisma.Decimal('150.30'),
      status: PaymentStatus.APPROVED,
      checkoutId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
      checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1',
      expiresAt: now,
      version: 2,
      createdAt: now,
      updatedAt: now,
    };

    const payment = PaymentMapper.toDomain(record);

    expect(payment).toMatchObject({ ...record, amount: 150.3 });
  });
});
