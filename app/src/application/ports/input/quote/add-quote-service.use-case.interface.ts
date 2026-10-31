import { Quote } from '@domain/entities/quote.entity';
import { AddQuoteServiceDto } from './dto/add-quote-service.dto';

export interface IAddQuoteServiceUseCase {
  execute(input: AddQuoteServiceDto): Promise<Quote>;
}
