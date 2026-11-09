import { OnModuleInit } from '@nestjs/common';

import { IRevertQuoteApprovalUseCase } from '@application/ports/input/quote/revert-quote-approval.use-case.interface';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

import { MessageHandlerRegistry } from '../../message-handler.registry';
import { RevertQuoteApprovalPayloadDto } from './dto/revert-quote-approval-payload.dto';

export class QuoteMessageHandlers implements OnModuleInit {
  constructor(
    private readonly registry: MessageHandlerRegistry,
    private readonly revertQuoteApprovalUseCase: IRevertQuoteApprovalUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      'billing.quote.revert_approval',
      ({ payload }) =>
        this.revertQuoteApprovalUseCase.execute(payload.quoteId, QuoteStatus[payload.revertTo]),
      RevertQuoteApprovalPayloadDto,
    );
  }
}
