import { Quote } from '@domain/entities/quote.entity';

export interface IRemoveQuotePartSupplyUseCase {
  execute(quoteId: string, partSupplyId: string): Promise<Quote>;
}
