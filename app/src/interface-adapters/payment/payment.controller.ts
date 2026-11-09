import { ICreatePaymentUseCase } from '@application/ports/input/payment/create-payment.use-case.interface';

import { PaymentPresenter } from './payment.presenter';
import { CreatePaymentRequest } from './requests/create-payment-request';
import { PaymentDataResponse } from './responses/payment.response';

export class PaymentController {
  constructor(private readonly createPaymentUseCase: ICreatePaymentUseCase) {}

  async create(input: CreatePaymentRequest): Promise<PaymentDataResponse> {
    return PaymentPresenter.toDataResponse(await this.createPaymentUseCase.execute(input));
  }
}
