import { FinalPaymentStatus } from '@domain/enums/payment-status.enum';

import { defineBusinessMetric } from './business-metric';

export const BUSINESS_METRICS = {
  PAYMENT_REQUESTED: defineBusinessMetric<Record<never, never>>({
    name: 'payment.requested',
    kind: 'counter',
    unit: '{payment}',
    description: 'Cobranças criadas no Mercado Pago e confirmadas em transação',
  }),
  PAYMENT_RESOLVED: defineBusinessMetric<{ paymentStatus: FinalPaymentStatus }>({
    name: 'payment.resolved',
    kind: 'counter',
    unit: '{payment}',
    description: 'Cobranças encerradas pela order do Mercado Pago, por status final',
  }),
} as const;
