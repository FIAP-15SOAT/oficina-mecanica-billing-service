import { IMercadoPagoOrderGateway } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.interface';

export function createMockMercadoPagoOrderGateway(): jest.Mocked<IMercadoPagoOrderGateway> {
  return { createOrder: jest.fn(), findOrderById: jest.fn(), cancelOrder: jest.fn() };
}
