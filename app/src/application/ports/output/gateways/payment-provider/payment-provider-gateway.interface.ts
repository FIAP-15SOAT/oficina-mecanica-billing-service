import {
  CheckoutGatewayResponse,
  CreatedCheckoutGatewayResponse,
} from './payment-provider-gateway.response';

export interface CheckoutCreationRequest {
  paymentId: string;
  amount: string;
  title: string;
  expirationTime: string;
}

export interface IPaymentProviderGateway {
  createCheckout(request: CheckoutCreationRequest): Promise<CreatedCheckoutGatewayResponse>;
  findCheckoutById(checkoutId: string): Promise<CheckoutGatewayResponse>;
  cancelCheckout(checkoutId: string): Promise<CheckoutGatewayResponse>;
}
