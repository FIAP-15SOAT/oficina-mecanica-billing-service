import { QuoteDecisionAction } from '@domain/enums/quote-decision-action.enum';

export interface DecideQuoteDto {
  action: QuoteDecisionAction;
  reason?: string | null;
  decidedBy: string;
}
