import { randomUUID } from 'node:crypto';
import { Payment, PaymentProps } from '@domain/entities/payment.entity';
import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

export function createMockPayment(overrides: Partial<PaymentProps> = {}): Payment {
  const now = new Date();

  return Payment.reconstitute({
    id: randomUUID(),
    workOrderId: randomUUID(),
    amount: 100,
    checkoutId: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
    checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1',
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    status: PaymentStatus.PENDING,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function createMockPaymentRepository(): jest.Mocked<IPaymentRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByCheckoutId: jest.fn(),
    findByWorkOrderId: jest.fn(),
    findAllPaginated: jest.fn(),
    update: jest.fn(),
  };
}
