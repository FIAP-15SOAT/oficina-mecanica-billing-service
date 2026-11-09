import { Payment } from '@domain/entities/payment.entity';
import { FinalPaymentStatus, PaymentStatus } from '@domain/enums/payment-status.enum';
import { OutboxMessage } from '@domain/messaging/message-catalog';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { BUSINESS_METRICS } from '@application/metrics/business-metric.catalog';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IMetrics } from '@application/ports/output/services/metrics.service.interface';

export class PaymentCloser {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly logger: ILogger,
    private readonly metrics: IMetrics,
  ) {}

  async close(payment: Payment, status: FinalPaymentStatus): Promise<Payment> {
    payment.resolve(status);

    // A concurrent close of the same payment fails here on the version, before the outbox row.
    const closed = await this.unitOfWork.executeTransaction(async (repos) => {
      const saved = await repos.payment.update(payment);

      await repos.outbox.add(this.outcomeMessageFor(saved, status));

      return saved;
    });

    this.metrics.increment(BUSINESS_METRICS.PAYMENT_RESOLVED, { paymentStatus: status });
    this.logOutcome(closed, status);

    return closed;
  }

  private outcomeMessageFor(payment: Payment, status: FinalPaymentStatus): OutboxMessage {
    if (status === PaymentStatus.APPROVED) {
      return {
        type: 'billing.payment.approved',
        workOrderId: payment.workOrderId,
        payload: {
          paymentId: payment.id,
          amount: payment.amount.toFixed(2),
          paidAt: payment.updatedAt.toISOString(),
        },
      };
    }

    return {
      type: 'billing.payment.failed',
      workOrderId: payment.workOrderId,
      payload: { paymentId: payment.id, reason: status },
    };
  }

  private logOutcome(payment: Payment, status: FinalPaymentStatus): void {
    const fields = {
      paymentId: payment.id,
      workOrderId: payment.workOrderId,
      checkoutId: payment.checkoutId,
    };

    if (status === PaymentStatus.APPROVED) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_APPROVED, fields);
    } else if (status === PaymentStatus.CANCELLED) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_CANCELLED, fields);
    } else {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_FAILED, { ...fields, paymentStatus: status });
    }
  }
}
