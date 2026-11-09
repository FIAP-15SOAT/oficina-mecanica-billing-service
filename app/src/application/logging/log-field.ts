export type LogicalFieldName =
  | 'quoteId'
  | 'quoteStatus'
  | 'workOrderId'
  | 'paymentId'
  | 'checkoutId'
  | 'paymentStatus'
  | 'checkoutStatus'
  | 'signatureFailureReason'
  | 'port'
  | 'signal'
  | 'dependencyName'
  | 'healthFailureCategory'
  | 'healthDegradedDurationMs';

export type LogFields = Partial<Record<LogicalFieldName, unknown>>;
