import { QuoteDecisionAction } from '@domain/enums/quote-decision-action.enum';

export interface DecideQuoteRequest {
  action: QuoteDecisionAction;
  reason?: string | null;
  decidedBy: string;
}
