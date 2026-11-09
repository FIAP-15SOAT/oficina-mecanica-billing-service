import { randomUUID } from 'node:crypto';

import { PaymentController } from '@interface-adapters/payment/payment.controller';
import { PaymentPresenter } from '@interface-adapters/payment/payment.presenter';
import { CreatePaymentRequest } from '@interface-adapters/payment/requests/create-payment-request';

import { ICreatePaymentUseCase } from '@application/ports/input/payment/create-payment.use-case.interface';

import { createMockPayment } from '../../../helpers/payment-mock.factory';

describe('PaymentController', () => {
  let createPaymentUseCase: jest.Mocked<ICreatePaymentUseCase>;
  let controller: PaymentController;

  beforeEach(() => {
    createPaymentUseCase = { execute: jest.fn() };

    controller = new PaymentController(createPaymentUseCase);
  });

  it('should create the payment and present it', async () => {
    const input: CreatePaymentRequest = { workOrderId: randomUUID(), amount: 100 };
    const payment = createMockPayment({ workOrderId: input.workOrderId, amount: input.amount });

    createPaymentUseCase.execute.mockResolvedValue(payment);

    await expect(controller.create(input)).resolves.toEqual(
      PaymentPresenter.toDataResponse(payment),
    );

    expect(createPaymentUseCase.execute).toHaveBeenCalledWith(input);
  });
});
