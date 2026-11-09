import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { CheckoutStatusMapper } from '@application/mappers/checkout-status.mapper';
import { ISyncPaymentStatusUseCase } from '@application/ports/input/payment/sync-payment-status.use-case.interface';
import { IPaymentProviderGateway } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.interface';
import { CheckoutStatus } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.response';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { PaymentCloser } from '@application/services/payment-closer';

// Only an approved payment can be refunded or charged back, so its checkout is still read.
const SYNCED_PAYMENT_STATUSES = [PaymentStatus.PENDING, PaymentStatus.APPROVED];

const REVERSED_CHECKOUT_STATUSES = [CheckoutStatus.REFUNDED, CheckoutStatus.CHARGED_BACK];

export class SyncPaymentStatusUseCase implements ISyncPaymentStatusUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly paymentProviderGateway: IPaymentProviderGateway,
    private readonly paymentCloser: PaymentCloser,
    private readonly logger: ILogger,
  ) {}

  async execute(checkoutId: string): Promise<void> {
    const payment = await this.paymentRepository.findByCheckoutId(checkoutId);

    if (!payment) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, { checkoutId });
      return;
    }

    const fields = { paymentId: payment.id, workOrderId: payment.workOrderId, checkoutId };

    if (!SYNCED_PAYMENT_STATUSES.includes(payment.status)) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, {
        ...fields,
        paymentStatus: payment.status,
      });

      return;
    }

    const checkout = await this.paymentProviderGateway.findCheckoutById(checkoutId);

    if (REVERSED_CHECKOUT_STATUSES.includes(checkout.status)) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_CHECKOUT_REVERSED, {
        ...fields,
        checkoutStatus: checkout.status,
      });

      return;
    }

    const finalStatus = CheckoutStatusMapper.toFinalPaymentStatus(checkout.status);

    if (payment.status === PaymentStatus.PENDING && finalStatus) {
      await this.paymentCloser.close(payment, finalStatus);
      return;
    }

    this.logger.event(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, {
      ...fields,
      paymentStatus: payment.status,
      checkoutStatus: checkout.status,
    });
  }
}
