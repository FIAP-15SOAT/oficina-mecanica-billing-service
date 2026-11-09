import { Payment } from '@domain/entities/payment.entity';
import { PaginatedResult } from '@domain/interfaces/common/pagination.interface';

import { FindAllPaymentsPaginatedInput } from './dto/find-all-payments-paginated.dto';

export interface IFindAllPaymentsPaginatedUseCase {
  execute(input: FindAllPaymentsPaginatedInput): Promise<PaginatedResult<Payment>>;
}
