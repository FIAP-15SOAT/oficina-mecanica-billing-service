import { randomUUID } from 'node:crypto';

import { PaymentController } from '@infrastructure/http/controllers/payment/payment.controller';
import { CreatePaymentRequestDto } from '@infrastructure/http/controllers/payment/dto/requests/create-payment-request.dto';
import { PaymentController as PaymentCleanController } from '@interface-adapters/payment/payment.controller';
import { PaymentPresenter } from '@interface-adapters/payment/payment.presenter';

import { createMockPayment } from '../../../../../helpers/payment-mock.factory';

describe('PaymentController (http)', () => {
  let cleanController: PaymentCleanController;
  let httpController: PaymentController;

  beforeEach(() => {
    cleanController = new PaymentCleanController({ execute: jest.fn() });

    httpController = new PaymentController(cleanController);
  });

  it('should delegate the creation with the body', async () => {
    const request: CreatePaymentRequestDto = { workOrderId: randomUUID(), amount: 100 };
    const response = PaymentPresenter.toDataResponse(createMockPayment());

    jest.spyOn(cleanController, 'create').mockResolvedValue(response);

    await expect(httpController.create(request)).resolves.toBe(response);
    expect(cleanController.create).toHaveBeenCalledWith(request);
  });
});
