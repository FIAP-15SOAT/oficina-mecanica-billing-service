export enum CheckoutStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CHARGED_BACK = 'CHARGED_BACK',
}

export interface CheckoutGatewayResponse {
  id: string;
  status: CheckoutStatus;
}

export interface CreatedCheckoutGatewayResponse extends CheckoutGatewayResponse {
  checkoutUrl: string;
}
