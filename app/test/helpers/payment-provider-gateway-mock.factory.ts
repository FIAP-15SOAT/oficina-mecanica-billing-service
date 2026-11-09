import { IPaymentProviderGateway } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.interface';

export function createMockPaymentProviderGateway(): jest.Mocked<IPaymentProviderGateway> {
  return { createCheckout: jest.fn(), findCheckoutById: jest.fn(), cancelCheckout: jest.fn() };
}
