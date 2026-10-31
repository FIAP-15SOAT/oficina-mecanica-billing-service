import { Quote } from '@domain/entities/quote.entity';
import { AddQuotePartSupplyDto } from './dto/add-quote-part-supply.dto';

export interface IAddQuotePartSupplyUseCase {
  execute(input: AddQuotePartSupplyDto): Promise<Quote>;
}
