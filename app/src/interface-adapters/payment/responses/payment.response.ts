import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { PaginationMeta } from '@domain/interfaces/common/pagination.interface';

export interface PaymentResponse {
  id: string;
  workOrderId: string;
  checkoutId: string;
  amount: number;
  status: PaymentStatus;
  checkoutUrl: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDataResponse {
  data: PaymentResponse;
}

export interface PaymentPaginatedResponse {
  data: PaymentResponse[];
  pagination: PaginationMeta;
}
