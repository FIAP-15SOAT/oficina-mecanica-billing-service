import { PaymentResponse } from './payment.response';

export interface InternalPaymentListResponse {
  data: PaymentResponse[];
}

// Decimal strings with two places, so the caller never sums floating-point amounts.
export interface InternalWorkOrderBalanceResponse {
  approvedTotal: string;
  paidTotal: string;
  balance: string;
}

export interface InternalWorkOrderBalanceDataResponse {
  data: InternalWorkOrderBalanceResponse;
}
