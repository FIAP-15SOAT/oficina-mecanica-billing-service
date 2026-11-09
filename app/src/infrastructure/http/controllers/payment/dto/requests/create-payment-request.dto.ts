import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID } from 'class-validator';

export class CreatePaymentRequestDto {
  @ApiProperty({ description: 'ID da ordem de serviço cobrada', format: 'uuid' })
  @IsUUID('4', { message: 'O ID da ordem de serviço deve ser um UUID válido' })
  workOrderId!: string;

  @ApiProperty({
    description: 'Valor da cobrança, maior que zero e no máximo o saldo da ordem de serviço',
    example: 100,
  })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'O valor da cobrança deve ser um número com no máximo 2 casas decimais' },
  )
  amount!: number;
}
