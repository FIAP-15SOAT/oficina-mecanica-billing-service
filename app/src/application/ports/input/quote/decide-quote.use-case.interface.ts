import { Quote } from '@domain/entities/quote.entity';
import { DecideQuoteDto } from './dto/decide-quote.dto';

export interface IDecideQuoteUseCase {
  execute(quoteId: string, input: DecideQuoteDto): Promise<Quote>;
}
