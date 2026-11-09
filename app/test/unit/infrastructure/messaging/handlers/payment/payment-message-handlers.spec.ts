import { randomUUID } from 'node:crypto';

import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { MessageEnvelope } from '@application/messaging/message-envelope';
import { ICancelPaymentUseCase } from '@application/ports/input/payment/cancel-payment.use-case.interface';
import { CancelPaymentPayloadDto } from '@infrastructure/messaging/handlers/payment/dto/cancel-payment-payload.dto';
import { PaymentMessageHandlers } from '@infrastructure/messaging/handlers/payment/payment-message-handlers';
import { MessageHandlerRegistry } from '@infrastructure/messaging/message-handler.registry';

import { createMockPayment } from '../../../../../helpers/payment-mock.factory';

describe('PaymentMessageHandlers', () => {
  let handlers: PaymentMessageHandlers;
  let registry: MessageHandlerRegistry;
  let cancelPaymentUseCase: jest.Mocked<ICancelPaymentUseCase>;
  let envelope: MessageEnvelope<'billing.payment.cancel'>;

  beforeEach(() => {
    registry = new MessageHandlerRegistry();

    cancelPaymentUseCase = { execute: jest.fn() };

    envelope = {
      messageId: randomUUID(),
      type: 'billing.payment.cancel',
      occurredAt: new Date().toISOString(),
      workOrderId: randomUUID(),
      payload: { paymentId: randomUUID(), reason: 'Saga compensada' },
    };

    handlers = new PaymentMessageHandlers(registry, cancelPaymentUseCase);
    handlers.onModuleInit();
  });

  it('should cancel the payment of the command', async () => {
    cancelPaymentUseCase.execute.mockResolvedValue(createMockPayment());

    const entry = registry.find('billing.payment.cancel');
    await entry?.handler(envelope);

    expect(entry?.payloadClass).toBe(CancelPaymentPayloadDto);
    expect(cancelPaymentUseCase.execute).toHaveBeenCalledWith(envelope.payload.paymentId);
  });

  it('should acknowledge a command whose payment cannot be cancelled', async () => {
    cancelPaymentUseCase.execute.mockRejectedValue(
      new ResourceConflictException('A cobrança não pode ser cancelada porque já foi paga'),
    );

    await expect(
      registry.find('billing.payment.cancel')?.handler(envelope),
    ).resolves.toBeUndefined();
  });

  it('should rethrow any other failure', async () => {
    const failure = new ResourceNotFoundException('Cobrança', envelope.payload.paymentId);

    cancelPaymentUseCase.execute.mockRejectedValue(failure);

    await expect(registry.find('billing.payment.cancel')?.handler(envelope)).rejects.toBe(failure);
  });
});
