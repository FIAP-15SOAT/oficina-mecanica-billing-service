import { IFindWorkOrderBalanceUseCase } from '@application/ports/input/payment/find-work-order-balance.use-case.interface';
import { IFindWorkOrderPaymentsUseCase } from '@application/ports/input/payment/find-work-order-payments.use-case.interface';

import { PaymentPresenter } from './payment.presenter';
import {
  InternalPaymentListResponse,
  InternalWorkOrderBalanceDataResponse,
} from './responses/internal-payment.response';

export class InternalPaymentController {
  constructor(
    private readonly findWorkOrderPaymentsUseCase: IFindWorkOrderPaymentsUseCase,
    private readonly findWorkOrderBalanceUseCase: IFindWorkOrderBalanceUseCase,
  ) {}

  async findWorkOrderPayments(workOrderId: string): Promise<InternalPaymentListResponse> {
    return PaymentPresenter.toListResponse(
      await this.findWorkOrderPaymentsUseCase.execute(workOrderId),
    );
  }

  async findWorkOrderBalance(workOrderId: string): Promise<InternalWorkOrderBalanceDataResponse> {
    return PaymentPresenter.toBalanceDataResponse(
      await this.findWorkOrderBalanceUseCase.execute(workOrderId),
    );
  }
}
