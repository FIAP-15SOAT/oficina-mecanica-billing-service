import { ICreatePaymentUseCase } from '@application/ports/input/payment/create-payment.use-case.interface';
import { IFindAllPaymentsPaginatedUseCase } from '@application/ports/input/payment/find-all-payments-paginated.use-case.interface';
import { IFindPaymentByIdUseCase } from '@application/ports/input/payment/find-payment-by-id.use-case.interface';

import { PaymentPresenter } from './payment.presenter';
import { CreatePaymentRequest } from './requests/create-payment-request';
import { FindAllPaymentsQuery } from './requests/find-all-payments-query';
import { PaymentDataResponse, PaymentPaginatedResponse } from './responses/payment.response';

export class PaymentController {
  constructor(
    private readonly createPaymentUseCase: ICreatePaymentUseCase,
    private readonly findPaymentByIdUseCase: IFindPaymentByIdUseCase,
    private readonly findAllPaymentsPaginatedUseCase: IFindAllPaymentsPaginatedUseCase,
  ) {}

  async create(input: CreatePaymentRequest): Promise<PaymentDataResponse> {
    return PaymentPresenter.toDataResponse(await this.createPaymentUseCase.execute(input));
  }

  async findOne(id: string): Promise<PaymentDataResponse> {
    return PaymentPresenter.toDataResponse(await this.findPaymentByIdUseCase.execute(id));
  }

  async findAll(query: FindAllPaymentsQuery): Promise<PaymentPaginatedResponse> {
    const result = await this.findAllPaymentsPaginatedUseCase.execute({
      ...query,
      page: query.page ?? 1,
      limit: query.limit ?? 10,
    });

    return PaymentPresenter.toPaginatedResponse(result);
  }
}
