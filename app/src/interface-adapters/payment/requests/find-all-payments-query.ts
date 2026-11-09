import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { PaginationQuery } from '@domain/interfaces/common/pagination.interface';

export interface FindAllPaymentsQuery extends PaginationQuery {
  workOrderId?: string;
  status?: PaymentStatus;
}
