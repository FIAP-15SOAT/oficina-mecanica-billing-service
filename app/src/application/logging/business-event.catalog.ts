import { QuoteStatus } from '@domain/enums/quote-status.enum';

import { defineLogEvent } from './log-event';

export const BUSINESS_EVENTS = {
  QUOTE_SUBMITTED: defineLogEvent<{ quoteId: string; workOrderId: string }>({
    name: 'quote.submitted',
    message: 'quote submitted to the customer for decision',
    level: 'info',
  }),
  QUOTE_APPROVED: defineLogEvent<{ quoteId: string; workOrderId: string }>({
    name: 'quote.approved',
    message: 'quote approved',
    level: 'info',
  }),
  QUOTE_REJECTED: defineLogEvent<{ quoteId: string; workOrderId: string }>({
    name: 'quote.rejected',
    message: 'quote rejected',
    level: 'info',
  }),
  QUOTE_APPROVAL_REVERTED: defineLogEvent<{ quoteId: string; quoteStatus: QuoteStatus }>({
    name: 'quote.approval_reverted',
    message: 'quote approval reverted',
    level: 'info',
  }),
  QUOTE_APPROVAL_REVERT_SKIPPED: defineLogEvent<{ quoteId: string; quoteStatus?: QuoteStatus }>({
    name: 'quote.approval_revert_skipped',
    message: 'quote approval revert skipped because the quote is not APPROVED',
    level: 'info',
  }),
} as const;
