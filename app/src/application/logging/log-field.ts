export type LogicalFieldName =
  | 'quoteId'
  | 'quoteStatus'
  | 'workOrderId'
  | 'port'
  | 'signal'
  | 'dependencyName'
  | 'healthFailureCategory'
  | 'healthDegradedDurationMs';

export type LogFields = Partial<Record<LogicalFieldName, unknown>>;
