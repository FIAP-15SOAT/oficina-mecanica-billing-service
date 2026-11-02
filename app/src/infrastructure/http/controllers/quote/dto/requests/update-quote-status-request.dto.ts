import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

export class UpdateQuoteStatusRequestDto {
  @ApiProperty({
    description: 'Novo status do orçamento',
    enum: [QuoteStatus.APPROVED, QuoteStatus.REJECTED],
    example: QuoteStatus.APPROVED,
  })
  @IsIn([QuoteStatus.APPROVED, QuoteStatus.REJECTED], {
    message: 'O status deve ser APPROVED ou REJECTED',
  })
  @IsNotEmpty({ message: 'O status é obrigatório' })
  status!: QuoteStatus.APPROVED | QuoteStatus.REJECTED;

  @ApiPropertyOptional({
    description: 'Motivo da rejeição (obrigatório se o status for REJECTED)',
    example: 'Preço acima do esperado',
  })
  @IsString({ message: 'O motivo deve ser um texto' })
  @IsOptional()
  reason?: string;
}
