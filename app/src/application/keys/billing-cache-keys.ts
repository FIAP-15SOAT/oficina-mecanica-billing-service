export const billingCacheKeys = {
  quote: (id: string): string => `billing:quote:${id}`,
  workOrderQuotes: (workOrderId: string): string => `billing:work-order-quotes:${workOrderId}`,
};
