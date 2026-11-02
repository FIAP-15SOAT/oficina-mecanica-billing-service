import { Quote } from '@domain/entities/quote.entity';

export interface IApproveQuoteUseCase {
  execute(quoteId: string, decidedBy: string): Promise<Quote>;
}
