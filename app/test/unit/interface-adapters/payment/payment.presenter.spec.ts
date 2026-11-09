import { PaymentPresenter } from '@interface-adapters/payment/payment.presenter';

import { createMockPayment } from '../../../helpers/payment-mock.factory';

describe('PaymentPresenter', () => {
  it('should project the payment fields inside the data envelope', () => {
    const payment = createMockPayment({ amount: 100.5 });

    const response = PaymentPresenter.toDataResponse(payment);

    expect(response).toEqual({
      data: {
        id: payment.id,
        workOrderId: payment.workOrderId,
        checkoutId: payment.checkoutId,
        amount: 100.5,
        status: payment.status,
        checkoutUrl: payment.checkoutUrl,
        expiresAt: payment.expiresAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });
  });
});
