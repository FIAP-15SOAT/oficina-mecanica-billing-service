export enum MercadoPagoOrderStatus {
  CREATED = 'created',
  ACTION_REQUIRED = 'action_required',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  EXPIRED = 'expired',
  CANCELED = 'canceled',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CHARGED_BACK = 'charged_back',
}

export interface MercadoPagoOrderGatewayResponse {
  id: string;
  status: MercadoPagoOrderStatus;
}

export interface MercadoPagoCheckoutOrderGatewayResponse extends MercadoPagoOrderGatewayResponse {
  checkoutUrl: string;
}
