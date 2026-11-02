import { Quote } from '@domain/entities/quote.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';

export interface ICreateQuoteUseCase {
  execute(input: CreateQuoteDto): Promise<Quote>;
}
