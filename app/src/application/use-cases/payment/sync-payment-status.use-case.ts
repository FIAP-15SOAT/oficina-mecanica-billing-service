import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { MercadoPagoOrderStatusMapper } from '@application/mappers/mercado-pago-order-status.mapper';
import { ISyncPaymentStatusUseCase } from '@application/ports/input/payment/sync-payment-status.use-case.interface';
import { IMercadoPagoOrderGateway } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.interface';
import { MercadoPagoOrderStatus } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.response';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { PaymentCloser } from '@application/services/payment-closer';

// Only an approved payment can be refunded or charged back, so its checkout is still read.
const SYNCED_PAYMENT_STATUSES = [PaymentStatus.PENDING, PaymentStatus.APPROVED];

const REVERSED_ORDER_STATUSES = [
  MercadoPagoOrderStatus.REFUNDED,
  MercadoPagoOrderStatus.CHARGED_BACK,
];

export class SyncPaymentStatusUseCase implements ISyncPaymentStatusUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly mercadoPagoOrderGateway: IMercadoPagoOrderGateway,
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

    const order = await this.mercadoPagoOrderGateway.findOrderById(checkoutId);

    if (REVERSED_ORDER_STATUSES.includes(order.status)) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_CHECKOUT_REVERSED, {
        ...fields,
        checkoutStatus: order.status,
      });

      return;
    }

    const finalStatus = MercadoPagoOrderStatusMapper.toFinalPaymentStatus(order.status);

    if (payment.status === PaymentStatus.PENDING && finalStatus) {
      await this.paymentCloser.close(payment, finalStatus);
      return;
    }

    this.logger.event(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, {
      ...fields,
      paymentStatus: payment.status,
      checkoutStatus: order.status,
    });
  }
}
