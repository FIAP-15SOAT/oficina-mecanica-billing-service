import { CheckoutStatus } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.response';
import { PaymentStatus } from '@domain/enums/payment-status.enum';
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
  QUOTE_WORK_ORDER_MISSING: defineLogEvent<{ workOrderId: string }>({
    name: 'quote.work_order_missing',
    message:
      'quotes listed without their work order because the work order service does not know it',
    level: 'warn',
  }),
  PAYMENT_REQUESTED: defineLogEvent<{ paymentId: string; workOrderId: string; checkoutId: string }>(
    {
      name: 'payment.requested',
      message: 'payment requested with a payment provider checkout',
      level: 'info',
    },
  ),
  PAYMENT_APPROVED: defineLogEvent<{ paymentId: string; workOrderId: string; checkoutId: string }>({
    name: 'payment.approved',
    message: 'payment approved by the payment provider checkout',
    level: 'info',
  }),
  PAYMENT_CANCELLED: defineLogEvent<{ paymentId: string; workOrderId: string; checkoutId: string }>(
    {
      name: 'payment.cancelled',
      message: 'payment cancelled',
      level: 'info',
    },
  ),
  PAYMENT_FAILED: defineLogEvent<{
    paymentId: string;
    workOrderId: string;
    checkoutId: string;
    paymentStatus: PaymentStatus;
  }>({
    name: 'payment.failed',
    message: 'payment closed without approval',
    level: 'info',
  }),
  PAYMENT_SYNC_SKIPPED: defineLogEvent<{
    paymentId?: string;
    workOrderId?: string;
    checkoutId: string;
    paymentStatus?: PaymentStatus;
    checkoutStatus?: CheckoutStatus;
  }>({
    name: 'payment.sync_skipped',
    message: 'payment status sync skipped without changing the payment',
    level: 'info',
  }),
  PAYMENT_CANCELLATION_SKIPPED: defineLogEvent<{
    paymentId: string;
    workOrderId: string;
    checkoutId: string;
    paymentStatus?: PaymentStatus;
    checkoutStatus?: CheckoutStatus;
  }>({
    name: 'payment.cancellation_skipped',
    message: 'payment cancellation refused without changing the payment',
    level: 'info',
  }),
  PAYMENT_CHECKOUT_REVERSED: defineLogEvent<{
    paymentId: string;
    workOrderId: string;
    checkoutId: string;
    checkoutStatus: CheckoutStatus;
  }>({
    name: 'payment.checkout_reversed',
    message: 'payment provider checkout refunded or charged back; the payment was not changed',
    level: 'warn',
  }),
} as const;
