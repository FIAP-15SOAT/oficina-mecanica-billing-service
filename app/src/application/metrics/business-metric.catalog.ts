import { defineBusinessMetric } from './business-metric';

export const BUSINESS_METRICS = {
  PAYMENT_REQUESTED: defineBusinessMetric<Record<never, never>>({
    name: 'payment.requested',
    kind: 'counter',
    unit: '{payment}',
    description: 'Cobranças criadas no Mercado Pago e confirmadas em transação',
  }),
} as const;
