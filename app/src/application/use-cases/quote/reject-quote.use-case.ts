import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { BadRequestException } from '@application/exceptions/bad-request.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { IRejectQuoteUseCase } from '@application/ports/input/quote/reject-quote.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';

export class RejectQuoteUseCase implements IRejectQuoteUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly logger: ILogger,
    private readonly cache: ICache,
  ) {}

  async execute(
    quoteId: string,
    reason: string | null | undefined,
    decidedBy: string,
  ): Promise<Quote> {
    const trimmedReason = reason?.trim();

    if (!trimmedReason) {
      throw new BadRequestException('A justificativa é obrigatória para rejeitar um orçamento');
    }

    const rejected = await this.unitOfWork.executeTransaction(async (repos) => {
      const quote = await repos.quote.findById(quoteId);

      if (!quote) {
        throw new ResourceNotFoundException('Orçamento', quoteId);
      }

      quote.reject(trimmedReason, decidedBy);

      const workOrderQuotes = await repos.quote.findByWorkOrderId(quote.workOrderId);

      const remainingSentCount = workOrderQuotes.filter(
        (other) => other.id !== quote.id && other.status === QuoteStatus.SENT,
      ).length;

      const updated = await repos.quote.update(quote);

      await repos.outbox.add({
        type: 'billing.quote.rejected',
        workOrderId: quote.workOrderId,
        payload: { quoteId: quote.id, reason: trimmedReason, remainingSentCount, decidedBy },
      });

      return updated;
    });

    await this.cache.delete([
      billingCacheKeys.quote(rejected.id),
      billingCacheKeys.workOrderQuotes(rejected.workOrderId),
    ]);

    this.logger.event(BUSINESS_EVENTS.QUOTE_REJECTED, {
      quoteId: rejected.id,
      workOrderId: rejected.workOrderId,
    });

    return rejected;
  }
}
