import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { QuoteDecisionAction } from '@domain/enums/quote-decision-action.enum';

export class DecideQuoteRequestDto {
  @IsEnum(QuoteDecisionAction, { message: 'Ação inválida. Use approve ou reject' })
  action!: QuoteDecisionAction;

  @IsOptional()
  @IsString({ message: 'O motivo deve ser um texto' })
  @MaxLength(500, { message: 'O motivo deve ter no máximo 500 caracteres' })
  reason?: string | null;

  @IsUUID(undefined, { message: 'O autor da decisão deve ser um UUID válido' })
  decidedBy!: string;
}
