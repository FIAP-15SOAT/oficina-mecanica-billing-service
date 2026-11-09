import { Payment } from '@domain/entities/payment.entity';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { IFindPaymentByIdUseCase } from '@application/ports/input/payment/find-payment-by-id.use-case.interface';

export class FindPaymentByIdUseCase implements IFindPaymentByIdUseCase {
  constructor(private readonly paymentRepository: IPaymentRepository) {}

  async execute(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(id);

    if (!payment) {
      throw new ResourceNotFoundException('Cobrança', id);
    }

    return payment;
  }
}
