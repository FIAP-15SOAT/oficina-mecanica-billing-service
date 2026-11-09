import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { PaginationInput } from '@domain/interfaces/common/pagination.interface';

export interface FindAllPaymentsPaginatedInput extends PaginationInput {
  workOrderId?: string;
  status?: PaymentStatus;
}
