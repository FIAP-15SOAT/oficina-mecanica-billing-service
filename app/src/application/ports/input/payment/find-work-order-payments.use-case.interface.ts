import { Payment } from '@domain/entities/payment.entity';

export interface IFindWorkOrderPaymentsUseCase {
  execute(workOrderId: string): Promise<Payment[]>;
}
