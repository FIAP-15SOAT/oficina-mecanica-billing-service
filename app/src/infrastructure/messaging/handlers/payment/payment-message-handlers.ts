import { OnModuleInit } from '@nestjs/common';

import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { MessageEnvelope } from '@application/messaging/message-envelope';
import { ICancelPaymentUseCase } from '@application/ports/input/payment/cancel-payment.use-case.interface';

import { MessageHandlerRegistry } from '../../message-handler.registry';
import { CancelPaymentPayloadDto } from './dto/cancel-payment-payload.dto';

export class PaymentMessageHandlers implements OnModuleInit {
  constructor(
    private readonly registry: MessageHandlerRegistry,
    private readonly cancelPaymentUseCase: ICancelPaymentUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      'billing.payment.cancel',
      (envelope) => this.cancelPayment(envelope),
      CancelPaymentPayloadDto,
    );
  }

  // A conflict is a final answer (closed, paid or still being paid) and redelivery would not
  // change it; any other failure throws so the message comes back or reaches the DLQ.
  private async cancelPayment({
    payload,
  }: MessageEnvelope<'billing.payment.cancel'>): Promise<void> {
    try {
      await this.cancelPaymentUseCase.execute(payload.paymentId);
    } catch (error) {
      if (!(error instanceof ResourceConflictException)) {
        throw error;
      }
    }
  }
}
