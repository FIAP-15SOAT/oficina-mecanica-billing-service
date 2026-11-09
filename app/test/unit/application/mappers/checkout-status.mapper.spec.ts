import { CheckoutStatusMapper } from '@application/mappers/checkout-status.mapper';
import { CheckoutStatus } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.response';
import { PaymentStatus } from '@domain/enums/payment-status.enum';

describe('CheckoutStatusMapper', () => {
  it.each([
    [CheckoutStatus.PAID, PaymentStatus.APPROVED],
    [CheckoutStatus.EXPIRED, PaymentStatus.EXPIRED],
    [CheckoutStatus.CANCELLED, PaymentStatus.CANCELLED],
    [CheckoutStatus.FAILED, PaymentStatus.REJECTED],
  ])(
    'should map a finished checkout to the final payment status (%s)',
    (checkoutStatus, paymentStatus) => {
      expect(CheckoutStatusMapper.toFinalPaymentStatus(checkoutStatus)).toBe(paymentStatus);
    },
  );

  it.each([
    CheckoutStatus.OPEN,
    CheckoutStatus.IN_PROGRESS,
    CheckoutStatus.REFUNDED,
    CheckoutStatus.CHARGED_BACK,
  ])('should leave every other checkout status unresolved (%s)', (checkoutStatus) => {
    expect(CheckoutStatusMapper.toFinalPaymentStatus(checkoutStatus)).toBeUndefined();
  });
});
