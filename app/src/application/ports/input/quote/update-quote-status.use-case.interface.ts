import { Quote } from '@domain/entities/quote.entity';
import { UpdateQuoteStatusDto } from '@application/ports/input/quote/dto/update-quote-status.dto';

export interface IUpdateQuoteStatusUseCase {
  execute(quoteId: string, decidedBy: string, dto: UpdateQuoteStatusDto): Promise<Quote>;
}
