import { randomUUID } from 'node:crypto';

import { InternalPaymentController } from '@interface-adapters/payment/internal-payment.controller';
import { PaymentPresenter } from '@interface-adapters/payment/payment.presenter';

import { IFindWorkOrderBalanceUseCase } from '@application/ports/input/payment/find-work-order-balance.use-case.interface';
import { IFindWorkOrderPaymentsUseCase } from '@application/ports/input/payment/find-work-order-payments.use-case.interface';

import { createMockPayment } from '../../../helpers/payment-mock.factory';

describe('InternalPaymentController', () => {
  let findWorkOrderPaymentsUseCase: jest.Mocked<IFindWorkOrderPaymentsUseCase>;
  let findWorkOrderBalanceUseCase: jest.Mocked<IFindWorkOrderBalanceUseCase>;
  let controller: InternalPaymentController;

  beforeEach(() => {
    findWorkOrderPaymentsUseCase = { execute: jest.fn() };

    findWorkOrderBalanceUseCase = { execute: jest.fn() };

    controller = new InternalPaymentController(
      findWorkOrderPaymentsUseCase,
      findWorkOrderBalanceUseCase,
    );
  });

  it('should list the work order payments and present them', async () => {
    const workOrderId = randomUUID();
    const payments = [createMockPayment({ workOrderId })];

    findWorkOrderPaymentsUseCase.execute.mockResolvedValue(payments);

    await expect(controller.findWorkOrderPayments(workOrderId)).resolves.toEqual(
      PaymentPresenter.toListResponse(payments),
    );

    expect(findWorkOrderPaymentsUseCase.execute).toHaveBeenCalledWith(workOrderId);
  });

  it('should read the work order balance and present it', async () => {
    const workOrderId = randomUUID();
    const balance = { approvedTotal: 500, paidTotal: 100, balance: 400, hasPendingPayment: false };

    findWorkOrderBalanceUseCase.execute.mockResolvedValue(balance);

    await expect(controller.findWorkOrderBalance(workOrderId)).resolves.toEqual(
      PaymentPresenter.toBalanceDataResponse(balance),
    );

    expect(findWorkOrderBalanceUseCase.execute).toHaveBeenCalledWith(workOrderId);
  });
});
