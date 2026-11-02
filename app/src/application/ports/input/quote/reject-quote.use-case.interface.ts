import { Quote } from '@domain/entities/quote.entity';

export interface IRejectQuoteUseCase {
  execute(quoteId: string, reason: string | null | undefined, decidedBy: string): Promise<Quote>;
}
