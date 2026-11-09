import { randomUUID } from 'node:crypto';

import { InternalPaymentController } from '@infrastructure/http/controllers/internal/internal-payment.controller';
import { InternalPaymentController as InternalPaymentCleanController } from '@interface-adapters/payment/internal-payment.controller';
import { PaymentPresenter } from '@interface-adapters/payment/payment.presenter';

import { createMockPayment } from '../../../../../helpers/payment-mock.factory';

describe('InternalPaymentController (http)', () => {
  let cleanController: InternalPaymentCleanController;
  let httpController: InternalPaymentController;

  beforeEach(() => {
    cleanController = new InternalPaymentCleanController(
      { execute: jest.fn() },
      { execute: jest.fn() },
    );

    httpController = new InternalPaymentController(cleanController);
  });

  it('should delegate the work order payments listing', async () => {
    const workOrderId = randomUUID();
    const response = PaymentPresenter.toListResponse([createMockPayment({ workOrderId })]);

    jest.spyOn(cleanController, 'findWorkOrderPayments').mockResolvedValue(response);

    await expect(httpController.findWorkOrderPayments(workOrderId)).resolves.toBe(response);
    expect(cleanController.findWorkOrderPayments).toHaveBeenCalledWith(workOrderId);
  });

  it('should delegate the work order balance', async () => {
    const workOrderId = randomUUID();

    const response = PaymentPresenter.toBalanceDataResponse({
      approvedTotal: 500,
      paidTotal: 100,
      balance: 400,
      hasPendingPayment: false,
    });

    jest.spyOn(cleanController, 'findWorkOrderBalance').mockResolvedValue(response);

    await expect(httpController.findWorkOrderBalance(workOrderId)).resolves.toBe(response);
    expect(cleanController.findWorkOrderBalance).toHaveBeenCalledWith(workOrderId);
  });
});
