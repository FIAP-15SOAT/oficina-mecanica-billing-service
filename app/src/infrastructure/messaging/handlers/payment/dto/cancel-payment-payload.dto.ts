import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CancelPaymentPayloadDto {
  @IsUUID('4')
  paymentId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
