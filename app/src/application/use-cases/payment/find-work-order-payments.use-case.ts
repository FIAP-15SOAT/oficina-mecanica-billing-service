import { Payment } from '@domain/entities/payment.entity';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { IFindWorkOrderPaymentsUseCase } from '@application/ports/input/payment/find-work-order-payments.use-case.interface';

export class FindWorkOrderPaymentsUseCase implements IFindWorkOrderPaymentsUseCase {
  constructor(private readonly paymentRepository: IPaymentRepository) {}

  execute(workOrderId: string): Promise<Payment[]> {
    return this.paymentRepository.findByWorkOrderId(workOrderId);
  }
}
