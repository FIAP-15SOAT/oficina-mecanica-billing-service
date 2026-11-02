import { QuoteStatus } from '@domain/enums/quote-status.enum';

export interface IRevertQuoteApprovalUseCase {
  execute(quoteId: string, revertTo: QuoteStatus.SENT | QuoteStatus.REJECTED): Promise<void>;
}
