import { Payment } from '@domain/entities/payment.entity';
import { PaginatedResult } from '@domain/interfaces/common/pagination.interface';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { FindAllPaymentsPaginatedInput } from '@application/ports/input/payment/dto/find-all-payments-paginated.dto';
import { IFindAllPaymentsPaginatedUseCase } from '@application/ports/input/payment/find-all-payments-paginated.use-case.interface';
import { buildPaginatedResult } from '@application/utils/pagination.util';

export class FindAllPaymentsPaginatedUseCase implements IFindAllPaymentsPaginatedUseCase {
  constructor(private readonly paymentRepository: IPaymentRepository) {}

  async execute(input: FindAllPaymentsPaginatedInput): Promise<PaginatedResult<Payment>> {
    const { page, limit, ...filters } = input;
    const pagination = { page, limit };

    const result = await this.paymentRepository.findAllPaginated(pagination, filters);

    return buildPaginatedResult(result, pagination);
  }
}
