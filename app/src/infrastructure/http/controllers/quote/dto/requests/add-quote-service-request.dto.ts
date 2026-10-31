import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AddQuoteServiceRequestDto {
  @ApiProperty({
    description: 'ID do serviço a ser adicionado ao orçamento',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440010',
  })
  @IsUUID(undefined, { message: 'O ID do serviço deve ser um UUID válido' })
  serviceId!: string;

  @ApiProperty({ description: 'Quantidade do serviço', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade deve ser no mínimo 1' })
  quantity!: number;
}
