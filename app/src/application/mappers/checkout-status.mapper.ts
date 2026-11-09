import { FinalPaymentStatus, PaymentStatus } from '@domain/enums/payment-status.enum';

import { CheckoutStatus } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.response';

const FINAL_PAYMENT_STATUS_BY_CHECKOUT_STATUS: Partial<Record<CheckoutStatus, FinalPaymentStatus>> =
  {
    [CheckoutStatus.PAID]: PaymentStatus.APPROVED,
    [CheckoutStatus.EXPIRED]: PaymentStatus.EXPIRED,
    [CheckoutStatus.CANCELLED]: PaymentStatus.CANCELLED,
    [CheckoutStatus.FAILED]: PaymentStatus.REJECTED,
  };

export class CheckoutStatusMapper {
  static toFinalPaymentStatus(checkoutStatus: CheckoutStatus): FinalPaymentStatus | undefined {
    return FINAL_PAYMENT_STATUS_BY_CHECKOUT_STATUS[checkoutStatus];
  }
}
