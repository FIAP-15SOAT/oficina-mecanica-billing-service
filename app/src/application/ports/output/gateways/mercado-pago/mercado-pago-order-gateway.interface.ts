import {
  MercadoPagoCheckoutOrderGatewayResponse,
  MercadoPagoOrderGatewayResponse,
} from './mercado-pago-order-gateway.response';

export interface MercadoPagoOrderCreationRequest {
  paymentId: string;
  amount: string;
  title: string;
  expirationTime: string;
}

export interface IMercadoPagoOrderGateway {
  createOrder(
    request: MercadoPagoOrderCreationRequest,
  ): Promise<MercadoPagoCheckoutOrderGatewayResponse>;
  findOrderById(orderId: string): Promise<MercadoPagoOrderGatewayResponse>;
  cancelOrder(orderId: string): Promise<MercadoPagoOrderGatewayResponse>;
}
