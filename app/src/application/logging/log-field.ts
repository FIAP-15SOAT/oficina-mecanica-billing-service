export type LogicalFieldName =
  | 'quoteId'
  | 'quoteStatus'
  | 'workOrderId'
  | 'paymentId'
  | 'checkoutId'
  | 'port'
  | 'signal'
  | 'dependencyName'
  | 'healthFailureCategory'
  | 'healthDegradedDurationMs';

export type LogFields = Partial<Record<LogicalFieldName, unknown>>;
