import { Quote } from '@domain/entities/quote.entity';
import { UpdateQuotePartSupplyQuantityDto } from './dto/update-quote-part-supply-quantity.dto';

export interface IUpdateQuotePartSupplyQuantityUseCase {
  execute(input: UpdateQuotePartSupplyQuantityDto): Promise<Quote>;
}
