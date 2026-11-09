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

  it('should project each payment with the pagination metadata', () => {
    const payments = [createMockPayment(), createMockPayment()];
    const pagination = { totalRecords: 2, totalPages: 1, page: 1, limit: 10 };

    const response = PaymentPresenter.toPaginatedResponse({ items: payments, pagination });

    expect(response).toEqual({
      data: payments.map((payment) => PaymentPresenter.toResponse(payment)),
      pagination,
    });
  });

  it('should project each payment inside the list envelope', () => {
    const payments = [createMockPayment(), createMockPayment()];

    const response = PaymentPresenter.toListResponse(payments);

    expect(response).toEqual({
      data: payments.map((payment) => PaymentPresenter.toResponse(payment)),
    });
  });

  it('should answer the balance as two-decimal strings', () => {
    const balance = { approvedTotal: 500, paidTotal: 100, balance: 400, hasPendingPayment: true };

    const response = PaymentPresenter.toBalanceDataResponse(balance);

    expect(response).toEqual({
      data: { approvedTotal: '500.00', paidTotal: '100.00', balance: '400.00' },
    });
  });
});
