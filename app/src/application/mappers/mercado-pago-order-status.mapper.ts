import { FinalPaymentStatus, PaymentStatus } from '@domain/enums/payment-status.enum';

import { MercadoPagoOrderStatus } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.response';

const FINAL_PAYMENT_STATUS_BY_ORDER_STATUS: Partial<
  Record<MercadoPagoOrderStatus, FinalPaymentStatus>
> = {
  [MercadoPagoOrderStatus.PROCESSED]: PaymentStatus.APPROVED,
  [MercadoPagoOrderStatus.EXPIRED]: PaymentStatus.EXPIRED,
  [MercadoPagoOrderStatus.CANCELED]: PaymentStatus.CANCELLED,
  [MercadoPagoOrderStatus.FAILED]: PaymentStatus.REJECTED,
};

export class MercadoPagoOrderStatusMapper {
  static toFinalPaymentStatus(orderStatus: MercadoPagoOrderStatus): FinalPaymentStatus | undefined {
    return FINAL_PAYMENT_STATUS_BY_ORDER_STATUS[orderStatus];
  }
}
