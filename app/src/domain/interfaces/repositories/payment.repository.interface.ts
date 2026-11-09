import { Payment } from '../../entities/payment.entity';
import { PaymentStatus } from '../../enums/payment-status.enum';
import { PaginatedRepositoryResult, PaginationInput } from '../common/pagination.interface';

export interface PaymentFilters {
  workOrderId?: string;
  status?: PaymentStatus;
}

export interface IPaymentRepository {
  create(payment: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByCheckoutId(checkoutId: string): Promise<Payment | null>;
  findByWorkOrderId(workOrderId: string): Promise<Payment[]>;
  findAllPaginated(
    pagination: PaginationInput,
    filters: PaymentFilters,
  ): Promise<PaginatedRepositoryResult<Payment>>;
  update(payment: Payment): Promise<Payment>;
}
