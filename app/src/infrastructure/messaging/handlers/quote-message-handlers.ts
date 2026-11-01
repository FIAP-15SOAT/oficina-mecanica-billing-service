import { Inject, Injectable, OnModuleInit } from '@nestjs/common';

import { IRevertQuoteApprovalUseCase } from '@application/ports/input/quote/revert-quote-approval.use-case.interface';
import { RevertQuoteApprovalUseCase } from '@application/use-cases/quote/revert-quote-approval.use-case';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

import { MessageHandlerRegistry } from '../message-handler.registry';
import { RevertQuoteApprovalPayloadDto } from './revert-quote-approval-payload.dto';

@Injectable()
export class QuoteMessageHandlers implements OnModuleInit {
  constructor(
    private readonly registry: MessageHandlerRegistry,
    @Inject(RevertQuoteApprovalUseCase)
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
