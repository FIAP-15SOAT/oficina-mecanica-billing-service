import type { Payment as PrismaPayment } from '@generated/client';
import { Payment } from '@domain/entities/payment.entity';
import { PaymentStatus } from '@domain/enums/payment-status.enum';

export class PaymentMapper {
  static toDomain(record: PrismaPayment): Payment {
    return Payment.reconstitute({
      id: record.id,
      workOrderId: record.workOrderId,
      amount: Number(record.amount),
      status: record.status as PaymentStatus,
      checkoutId: record.checkoutId,
      checkoutUrl: record.checkoutUrl,
      expiresAt: record.expiresAt,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
