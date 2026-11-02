import { Quote } from '@domain/entities/quote.entity';

export interface ISubmitQuoteUseCase {
  execute(quoteId: string, sentBy: string): Promise<Quote>;
}
