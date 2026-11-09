import { PaymentWebhookController } from '@infrastructure/http/controllers/payment/payment-webhook.controller';
import { PaymentWebhookController as PaymentWebhookCleanController } from '@interface-adapters/payment/payment-webhook.controller';

describe('PaymentWebhookController (http)', () => {
  let cleanController: PaymentWebhookCleanController;
  let httpController: PaymentWebhookController;

  beforeEach(() => {
    cleanController = new PaymentWebhookCleanController({ execute: jest.fn() });

    httpController = new PaymentWebhookController(cleanController);
  });

  it('should delegate the notification with the data id', async () => {
    jest.spyOn(cleanController, 'receive').mockResolvedValue();

    await httpController.receive('ORD000001');

    expect(cleanController.receive).toHaveBeenCalledWith('ORD000001');
  });
});
