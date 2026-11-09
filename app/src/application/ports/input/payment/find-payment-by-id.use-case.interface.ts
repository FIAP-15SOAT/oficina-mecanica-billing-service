import { Payment } from '@domain/entities/payment.entity';

export interface IFindPaymentByIdUseCase {
  execute(id: string): Promise<Payment>;
}
