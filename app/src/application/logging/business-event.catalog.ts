import { defineLogEvent } from './log-event';

export const BUSINESS_EVENTS = {
  QUOTE_SUBMITTED: defineLogEvent<{ quoteId: string; workOrderId: string }>({
    name: 'quote.submitted',
    message: 'quote submitted to the customer for decision',
    level: 'info',
  }),
} as const;
