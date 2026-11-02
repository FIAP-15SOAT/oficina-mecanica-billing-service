import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AddQuotePartSupplyRequestDto {
  @ApiProperty({
    description: 'ID da peça/insumo a ser adicionado ao orçamento',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440020',
  })
  @IsUUID(undefined, { message: 'O ID da peça/insumo deve ser um UUID válido' })
  partSupplyId!: string;

  @ApiProperty({ description: 'Quantidade da peça/insumo', example: 2 })
  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade deve ser no mínimo 1' })
  quantity!: number;
}
