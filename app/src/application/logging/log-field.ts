export type LogicalFieldName =
  | 'quoteId'
  | 'workOrderId'
  | 'port'
  | 'signal'
  | 'dependencyName'
  | 'healthFailureCategory'
  | 'healthDegradedDurationMs';

export type LogFields = Partial<Record<LogicalFieldName, unknown>>;
