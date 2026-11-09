import { Payment } from '@domain/entities/payment.entity';
import { PaginatedResult } from '@domain/interfaces/common/pagination.interface';

import {
  PaymentDataResponse,
  PaymentPaginatedResponse,
  PaymentResponse,
} from './responses/payment.response';

export class PaymentPresenter {
  static toResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      workOrderId: payment.workOrderId,
      checkoutId: payment.checkoutId,
      amount: payment.amount,
      status: payment.status,
      checkoutUrl: payment.checkoutUrl,
      expiresAt: payment.expiresAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  static toDataResponse(payment: Payment): PaymentDataResponse {
    return { data: PaymentPresenter.toResponse(payment) };
  }

  static toPaginatedResponse(result: PaginatedResult<Payment>): PaymentPaginatedResponse {
    return {
      data: result.items.map((payment) => PaymentPresenter.toResponse(payment)),
      pagination: result.pagination,
    };
  }
}
