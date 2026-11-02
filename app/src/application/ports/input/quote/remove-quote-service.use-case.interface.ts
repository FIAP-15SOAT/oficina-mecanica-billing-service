import { Quote } from '@domain/entities/quote.entity';

export interface IRemoveQuoteServiceUseCase {
  execute(quoteId: string, serviceId: string): Promise<Quote>;
}
