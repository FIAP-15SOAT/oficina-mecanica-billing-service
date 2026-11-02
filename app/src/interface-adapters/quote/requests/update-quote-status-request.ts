import { QuoteStatus } from '@domain/enums/quote-status.enum';

export interface UpdateQuoteStatusRequest {
  status: QuoteStatus.APPROVED | QuoteStatus.REJECTED;
  reason?: string;
}
