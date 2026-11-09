import { Module } from '@nestjs/common';

import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { RevertQuoteApprovalUseCase } from '@application/use-cases/quote/revert-quote-approval.use-case';

import { MessageHandlerRegistry } from '../../message-handler.registry';
import { QuoteMessageHandlers } from './quote-message-handlers';

@Module({
  providers: [
    {
      provide: QuoteMessageHandlers,
      useFactory: (
        registry: MessageHandlerRegistry,
        unitOfWork: IUnitOfWork,
        logger: ILogger,
        cache: ICache,
      ) =>
        new QuoteMessageHandlers(
          registry,
          new RevertQuoteApprovalUseCase(unitOfWork, logger, cache),
        ),
      inject: [MessageHandlerRegistry, 'IUnitOfWork', 'ILogger', 'ICache'],
    },
  ],
})
export class QuoteMessagingModule {}
