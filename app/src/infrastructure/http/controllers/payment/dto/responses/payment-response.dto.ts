import { ApiProperty } from '@nestjs/swagger';

import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { PaginatedResponseDto } from '@infrastructure/http/common/dto/paginated-response.dto';
import {
  PaymentDataResponse,
  PaymentPaginatedResponse,
  PaymentResponse,
} from '@interface-adapters/payment/responses/payment.response';

export class PaymentResponseDto implements PaymentResponse {
  @ApiProperty({
    description: 'ID da cobrança',
    format: 'uuid',
    example: '3f1c9a52-7d4e-4b8a-9c21-5e6f7a8b9c0d',
  })
  id!: string;

  @ApiProperty({ description: 'ID da ordem de serviço cobrada', format: 'uuid' })
  workOrderId!: string;

  @ApiProperty({
    description: 'ID do checkout no provedor de pagamento',
    example: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3',
  })
  checkoutId!: string;

  @ApiProperty({ description: 'Valor da cobrança', example: 100 })
  amount!: number;

  @ApiProperty({
    description: 'Status da cobrança',
    enum: PaymentStatus,
    example: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @ApiProperty({
    description: 'Link de pagamento enviado ao cliente',
    example: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1',
  })
  checkoutUrl!: string;

  @ApiProperty({
    description: 'Data em que o link de pagamento expira',
    example: '2026-11-09T12:00:00.000Z',
  })
  expiresAt!: Date;

  @ApiProperty({ description: 'Data de criação', example: '2026-11-08T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Data da última atualização', example: '2026-11-08T12:00:00.000Z' })
  updatedAt!: Date;
}

export class PaymentDataResponseDto implements PaymentDataResponse {
  @ApiProperty({ type: PaymentResponseDto })
  data!: PaymentResponseDto;
}

export class PaymentPaginatedResponseDto
  extends PaginatedResponseDto<PaymentResponseDto>
  implements PaymentPaginatedResponse
{
  @ApiProperty({ type: [PaymentResponseDto] })
  data!: PaymentResponseDto[];
}
