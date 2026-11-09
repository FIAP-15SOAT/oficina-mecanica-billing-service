import { Payment } from '@domain/entities/payment.entity';

export interface ICancelPaymentUseCase {
  execute(paymentId: string): Promise<Payment>;
}
