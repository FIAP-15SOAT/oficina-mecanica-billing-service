import { PaymentWebhookController } from '@interface-adapters/payment/payment-webhook.controller';

import { ISyncPaymentStatusUseCase } from '@application/ports/input/payment/sync-payment-status.use-case.interface';

describe('PaymentWebhookController', () => {
  let syncPaymentStatusUseCase: jest.Mocked<ISyncPaymentStatusUseCase>;
  let controller: PaymentWebhookController;

  beforeEach(() => {
    syncPaymentStatusUseCase = { execute: jest.fn() };

    controller = new PaymentWebhookController(syncPaymentStatusUseCase);
  });

  it('should process the notification with the original order id', async () => {
    syncPaymentStatusUseCase.execute.mockResolvedValue();

    await controller.receive('ORD000001');

    expect(syncPaymentStatusUseCase.execute).toHaveBeenCalledWith('ORD000001');
  });
});
