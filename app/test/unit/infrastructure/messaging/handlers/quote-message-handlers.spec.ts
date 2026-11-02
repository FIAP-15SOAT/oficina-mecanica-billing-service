import { randomUUID } from 'node:crypto';

import { MessageEnvelope } from '@application/messaging/message-envelope';
import { IRevertQuoteApprovalUseCase } from '@application/ports/input/quote/revert-quote-approval.use-case.interface';
import { QuoteMessageHandlers } from '@infrastructure/messaging/handlers/quote-message-handlers';
import { RevertQuoteApprovalPayloadDto } from '@infrastructure/messaging/handlers/revert-quote-approval-payload.dto';
import { MessageHandlerRegistry } from '@infrastructure/messaging/message-handler.registry';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

describe('QuoteMessageHandlers', () => {
  let handlers: QuoteMessageHandlers;
  let registry: MessageHandlerRegistry;
  let revertQuoteApprovalUseCase: jest.Mocked<IRevertQuoteApprovalUseCase>;

  beforeEach(() => {
    registry = new MessageHandlerRegistry();

    revertQuoteApprovalUseCase = { execute: jest.fn().mockResolvedValue(undefined) };

    handlers = new QuoteMessageHandlers(registry, revertQuoteApprovalUseCase);
  });

  it('should register the revert command with its payload class and delegate the payload', async () => {
    const envelope: MessageEnvelope<'billing.quote.revert_approval'> = {
      messageId: randomUUID(),
      type: 'billing.quote.revert_approval',
      occurredAt: new Date().toISOString(),
      workOrderId: randomUUID(),
      payload: { quoteId: randomUUID(), revertTo: 'SENT' },
    };

    handlers.onModuleInit();

    const entry = registry.find('billing.quote.revert_approval');
    await entry?.handler(envelope);

    expect(entry?.payloadClass).toBe(RevertQuoteApprovalPayloadDto);

    expect(revertQuoteApprovalUseCase.execute).toHaveBeenCalledWith(
      envelope.payload.quoteId,
      QuoteStatus.SENT,
    );
  });
});
