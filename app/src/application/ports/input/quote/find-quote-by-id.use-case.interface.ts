import { Quote } from '@domain/entities/quote.entity';

export interface IFindQuoteByIdUseCase {
  execute(id: string): Promise<Quote>;
}
