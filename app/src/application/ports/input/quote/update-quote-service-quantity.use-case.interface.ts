import { Quote } from '@domain/entities/quote.entity';
import { UpdateQuoteServiceQuantityDto } from './dto/update-quote-service-quantity.dto';

export interface IUpdateQuoteServiceQuantityUseCase {
  execute(input: UpdateQuoteServiceQuantityDto): Promise<Quote>;
}
