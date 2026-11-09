import { ISyncPaymentStatusUseCase } from '@application/ports/input/payment/sync-payment-status.use-case.interface';

export class PaymentWebhookController {
  constructor(private readonly syncPaymentStatusUseCase: ISyncPaymentStatusUseCase) {}

  receive(checkoutId: string): Promise<void> {
    return this.syncPaymentStatusUseCase.execute(checkoutId);
  }
}
