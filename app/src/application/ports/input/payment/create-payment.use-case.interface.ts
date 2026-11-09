import { Payment } from '@domain/entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';

export interface ICreatePaymentUseCase {
  execute(input: CreatePaymentDto): Promise<Payment>;
}
