import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateBy } from 'class-validator';

// Checked on the text form: IsNumber's maxDecimalPlaces throws on values like 2e-7, which have no
// decimal point. Zero and negative values pass here and are refused by the domain.
const AT_MOST_TWO_DECIMAL_PLACES = /^-?\d+(\.\d{1,2})?$/;

export class CreatePaymentRequestDto {
  @ApiProperty({ description: 'ID da ordem de serviço cobrada', format: 'uuid' })
  @IsUUID(undefined, { message: 'O ID da ordem de serviço deve ser um UUID válido' })
  workOrderId!: string;

  @ApiProperty({
    description: 'Valor da cobrança, maior que zero e no máximo o saldo da ordem de serviço',
    example: 100,
  })
  @ValidateBy(
    {
      name: 'isAmountWithTwoDecimalPlaces',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'number' && AT_MOST_TWO_DECIMAL_PLACES.test(String(value)),
      },
    },
    { message: 'O valor da cobrança deve ser um número com no máximo 2 casas decimais' },
  )
  amount!: number;
}
