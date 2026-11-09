import { randomUUID } from 'node:crypto';

import { PaymentStatus } from '@domain/enums/payment-status.enum';

import { PaymentController } from '@infrastructure/http/controllers/payment/payment.controller';
import { CreatePaymentRequestDto } from '@infrastructure/http/controllers/payment/dto/requests/create-payment-request.dto';
import { FindAllPaymentsQueryDto } from '@infrastructure/http/controllers/payment/dto/requests/find-all-payments-query.dto';
import { PaymentController as PaymentCleanController } from '@interface-adapters/payment/payment.controller';
import { PaymentPresenter } from '@interface-adapters/payment/payment.presenter';

import { createMockPayment } from '../../../../../helpers/payment-mock.factory';

describe('PaymentController (http)', () => {
  let cleanController: PaymentCleanController;
  let httpController: PaymentController;

  beforeEach(() => {
    cleanController = new PaymentCleanController(
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
    );

    httpController = new PaymentController(cleanController);
  });

  it('should delegate the creation with the body', async () => {
    const request: CreatePaymentRequestDto = { workOrderId: randomUUID(), amount: 100 };
    const response = PaymentPresenter.toDataResponse(createMockPayment());

    jest.spyOn(cleanController, 'create').mockResolvedValue(response);

    await expect(httpController.create(request)).resolves.toBe(response);
    expect(cleanController.create).toHaveBeenCalledWith(request);
  });

  it('should delegate the lookup with the id', async () => {
    const payment = createMockPayment();
    const response = PaymentPresenter.toDataResponse(payment);

    jest.spyOn(cleanController, 'findOne').mockResolvedValue(response);

    await expect(httpController.findOne(payment.id)).resolves.toBe(response);
    expect(cleanController.findOne).toHaveBeenCalledWith(payment.id);
  });

  it('should delegate the listing with the query', async () => {
    const query: FindAllPaymentsQueryDto = { status: PaymentStatus.APPROVED, page: 2, limit: 5 };

    const response = PaymentPresenter.toPaginatedResponse({
      items: [],
      pagination: { totalRecords: 0, totalPages: 0, page: 2, limit: 5 },
    });

    jest.spyOn(cleanController, 'findAll').mockResolvedValue(response);

    await expect(httpController.findAll(query)).resolves.toBe(response);
    expect(cleanController.findAll).toHaveBeenCalledWith(query);
  });

  it('should return the cancelled payment', async () => {
    const payment = createMockPayment({ status: PaymentStatus.CANCELLED });
    const response = PaymentPresenter.toDataResponse(payment);

    jest.spyOn(cleanController, 'cancel').mockResolvedValue(response);

    await expect(httpController.cancel(payment.id)).resolves.toBe(response);
    expect(cleanController.cancel).toHaveBeenCalledWith(payment.id);
  });
});
