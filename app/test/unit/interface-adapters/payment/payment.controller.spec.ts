import { randomUUID } from 'node:crypto';

import { PaymentStatus } from '@domain/enums/payment-status.enum';

import { PaymentController } from '@interface-adapters/payment/payment.controller';
import { PaymentPresenter } from '@interface-adapters/payment/payment.presenter';
import { CreatePaymentRequest } from '@interface-adapters/payment/requests/create-payment-request';

import { ICreatePaymentUseCase } from '@application/ports/input/payment/create-payment.use-case.interface';
import { IFindAllPaymentsPaginatedUseCase } from '@application/ports/input/payment/find-all-payments-paginated.use-case.interface';
import { IFindPaymentByIdUseCase } from '@application/ports/input/payment/find-payment-by-id.use-case.interface';
import { ICancelPaymentUseCase } from '@application/ports/input/payment/cancel-payment.use-case.interface';

import { createMockPayment } from '../../../helpers/payment-mock.factory';

describe('PaymentController', () => {
  let createPaymentUseCase: jest.Mocked<ICreatePaymentUseCase>;
  let findPaymentByIdUseCase: jest.Mocked<IFindPaymentByIdUseCase>;
  let findAllPaymentsPaginatedUseCase: jest.Mocked<IFindAllPaymentsPaginatedUseCase>;
  let cancelPaymentUseCase: jest.Mocked<ICancelPaymentUseCase>;
  let controller: PaymentController;

  beforeEach(() => {
    createPaymentUseCase = { execute: jest.fn() };

    findPaymentByIdUseCase = { execute: jest.fn() };

    findAllPaymentsPaginatedUseCase = { execute: jest.fn() };

    cancelPaymentUseCase = { execute: jest.fn() };

    controller = new PaymentController(
      createPaymentUseCase,
      findPaymentByIdUseCase,
      findAllPaymentsPaginatedUseCase,
      cancelPaymentUseCase,
    );
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

  it('should find the payment by id and present it', async () => {
    const payment = createMockPayment();

    findPaymentByIdUseCase.execute.mockResolvedValue(payment);

    await expect(controller.findOne(payment.id)).resolves.toEqual(
      PaymentPresenter.toDataResponse(payment),
    );

    expect(findPaymentByIdUseCase.execute).toHaveBeenCalledWith(payment.id);
  });

  it('should list the payments with page 1 and limit 10 by default', async () => {
    const result = {
      items: [createMockPayment()],
      pagination: { totalRecords: 1, totalPages: 1, page: 1, limit: 10 },
    };

    findAllPaymentsPaginatedUseCase.execute.mockResolvedValue(result);

    await expect(controller.findAll({ status: PaymentStatus.PENDING })).resolves.toEqual(
      PaymentPresenter.toPaginatedResponse(result),
    );

    expect(findAllPaymentsPaginatedUseCase.execute).toHaveBeenCalledWith({
      status: PaymentStatus.PENDING,
      page: 1,
      limit: 10,
    });
  });

  it('should keep the page and limit from the query', async () => {
    const workOrderId = randomUUID();

    findAllPaymentsPaginatedUseCase.execute.mockResolvedValue({
      items: [],
      pagination: { totalRecords: 0, totalPages: 0, page: 3, limit: 20 },
    });

    await controller.findAll({ workOrderId, page: 3, limit: 20 });

    expect(findAllPaymentsPaginatedUseCase.execute).toHaveBeenCalledWith({
      workOrderId,
      page: 3,
      limit: 20,
    });
  });

  it('should return the cancelled payment', async () => {
    const payment = createMockPayment({ status: PaymentStatus.CANCELLED });

    cancelPaymentUseCase.execute.mockResolvedValue(payment);

    await expect(controller.cancel(payment.id)).resolves.toEqual(
      PaymentPresenter.toDataResponse(payment),
    );

    expect(cancelPaymentUseCase.execute).toHaveBeenCalledWith(payment.id);
  });
});
