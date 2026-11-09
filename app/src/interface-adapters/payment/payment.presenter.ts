import { Payment } from '@domain/entities/payment.entity';
import { PaginatedResult } from '@domain/interfaces/common/pagination.interface';

import { WorkOrderBalance } from '@application/services/work-order-balance-reader';

import {
  InternalPaymentListResponse,
  InternalWorkOrderBalanceDataResponse,
} from './responses/internal-payment.response';
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

  static toListResponse(payments: readonly Payment[]): InternalPaymentListResponse {
    return { data: payments.map((payment) => PaymentPresenter.toResponse(payment)) };
  }

  static toBalanceDataResponse(balance: WorkOrderBalance): InternalWorkOrderBalanceDataResponse {
    return {
      data: {
        approvedTotal: balance.approvedTotal.toFixed(2),
        paidTotal: balance.paidTotal.toFixed(2),
        balance: balance.balance.toFixed(2),
      },
    };
  }
}
