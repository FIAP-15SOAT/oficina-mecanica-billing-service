import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { MAX_NOTES_LENGTH } from '@domain/constants/validation/quote.constants';

export class CreateQuoteItemServiceRequestDto {
  @ApiProperty({
    description: 'ID do serviço a ser incluído no orçamento',
    format: 'uuid',
  })
  @IsUUID(undefined, { message: 'O ID do serviço deve ser um UUID válido' })
  serviceId!: string;

  @ApiProperty({ description: 'Quantidade do serviço', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade deve ser no mínimo 1' })
  quantity!: number;
}

export class CreateQuoteItemPartSupplyRequestDto {
  @ApiProperty({
    description: 'ID da peça/insumo a ser incluído no orçamento',
    format: 'uuid',
  })
  @IsUUID(undefined, { message: 'O ID da peça/insumo deve ser um UUID válido' })
  partSupplyId!: string;

  @ApiProperty({ description: 'Quantidade da peça/insumo', example: 2 })
  @Type(() => Number)
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade deve ser no mínimo 1' })
  quantity!: number;
}

export class CreateQuoteRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'O ID da ordem de serviço deve ser um UUID válido' })
  workOrderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'As notas devem ser um texto' })
  @MaxLength(MAX_NOTES_LENGTH, {
    message: `As notas devem ter no máximo ${MAX_NOTES_LENGTH} caracteres`,
  })
  notes?: string | null;

  @ApiPropertyOptional({
    type: [CreateQuoteItemServiceRequestDto],
    description: 'Serviços a serem adicionados ao orçamento no momento da criação',
  })
  @IsOptional()
  @IsArray({ message: 'Os serviços devem ser uma lista' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemServiceRequestDto)
  services?: CreateQuoteItemServiceRequestDto[];

  @ApiPropertyOptional({
    type: [CreateQuoteItemPartSupplyRequestDto],
    description: 'Peças/insumos a serem adicionados ao orçamento no momento da criação',
  })
  @IsOptional()
  @IsArray({ message: 'As peças/insumos devem ser uma lista' })
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemPartSupplyRequestDto)
  partsSupplies?: CreateQuoteItemPartSupplyRequestDto[];
}
