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
} as const;
