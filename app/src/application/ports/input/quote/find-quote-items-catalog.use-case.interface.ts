import { Quote } from '@domain/entities/quote.entity';
import { QuoteItemsCatalog } from '@application/ports/input/quote/dto/find-quote-items-catalog.dto';

export interface IFindQuoteItemsCatalogUseCase {
  execute(quote: Quote): Promise<QuoteItemsCatalog>;
}
