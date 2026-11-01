import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

export interface UpdateQuoteStatusDto {
  status: QuoteStatus.APPROVED | QuoteStatus.REJECTED;
  reason?: string | null;
}

export interface IUpdateQuoteStatusUseCase {
  execute(quoteId: string, decidedBy: string, dto: UpdateQuoteStatusDto): Promise<Quote>;
}
