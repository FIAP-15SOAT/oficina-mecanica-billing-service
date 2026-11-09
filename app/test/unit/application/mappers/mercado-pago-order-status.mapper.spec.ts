import { MercadoPagoOrderStatusMapper } from '@application/mappers/mercado-pago-order-status.mapper';
import { MercadoPagoOrderStatus } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.response';
import { PaymentStatus } from '@domain/enums/payment-status.enum';

describe('MercadoPagoOrderStatusMapper', () => {
  it.each([
    [MercadoPagoOrderStatus.PROCESSED, PaymentStatus.APPROVED],
    [MercadoPagoOrderStatus.EXPIRED, PaymentStatus.EXPIRED],
    [MercadoPagoOrderStatus.CANCELED, PaymentStatus.CANCELLED],
    [MercadoPagoOrderStatus.FAILED, PaymentStatus.REJECTED],
  ])(
    'should map processed, expired, canceled and failed to the final statuses (%s)',
    (orderStatus, paymentStatus) => {
      expect(MercadoPagoOrderStatusMapper.toFinalPaymentStatus(orderStatus)).toBe(paymentStatus);
    },
  );

  it.each([
    MercadoPagoOrderStatus.CREATED,
    MercadoPagoOrderStatus.ACTION_REQUIRED,
    MercadoPagoOrderStatus.PROCESSING,
    MercadoPagoOrderStatus.REFUNDED,
    MercadoPagoOrderStatus.CHARGED_BACK,
  ])('should leave every other order status unresolved (%s)', (orderStatus) => {
    expect(MercadoPagoOrderStatusMapper.toFinalPaymentStatus(orderStatus)).toBeUndefined();
  });
});
