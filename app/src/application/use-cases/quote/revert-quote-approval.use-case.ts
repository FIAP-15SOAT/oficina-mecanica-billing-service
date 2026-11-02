import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { IRevertQuoteApprovalUseCase } from '@application/ports/input/quote/revert-quote-approval.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';

type ApprovalReversal =
  | { reverted: false; quoteStatus?: QuoteStatus }
  | { reverted: true; quote: Quote; restoredQuotes: Quote[] };

export class RevertQuoteApprovalUseCase implements IRevertQuoteApprovalUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly logger: ILogger,
    private readonly cache: ICache,
  ) {}

  async execute(quoteId: string, revertTo: QuoteStatus.SENT | QuoteStatus.REJECTED): Promise<void> {
    const reversal = await this.unitOfWork.executeTransaction(
      async (repos): Promise<ApprovalReversal> => {
        const quote = await repos.quote.findById(quoteId);

        // A repeated command finds the quote already reverted; the first run published the reply.
        if (quote?.status !== QuoteStatus.APPROVED) {
          return { reverted: false, quoteStatus: quote?.status };
        }

        const workOrderQuotes = await repos.quote.findByWorkOrderId(quote.workOrderId);

        quote.revertApproval(revertTo);

        const restoredQuotes = this.undoRejectionsByApproval(quote, workOrderQuotes);

        await this.updateQuotesStatuses(repos.quote, [quote, ...restoredQuotes]);

        await repos.outbox.add({
          type: 'billing.quote.approval_reverted',
          workOrderId: quote.workOrderId,
          payload: { quoteId: quote.id, revertTo },
        });

        return { reverted: true, quote, restoredQuotes };
      },
    );

    if (!reversal.reverted) {
      this.logger.event(BUSINESS_EVENTS.QUOTE_APPROVAL_REVERT_SKIPPED, {
        quoteId,
        quoteStatus: reversal.quoteStatus,
      });

      return;
    }

    const { quote, restoredQuotes } = reversal;

    await this.cache.delete([
      billingCacheKeys.quote(quote.id),
      ...restoredQuotes.map((restoredQuote) => billingCacheKeys.quote(restoredQuote.id)),
      billingCacheKeys.workOrderQuotes(quote.workOrderId),
    ]);

    this.logger.event(BUSINESS_EVENTS.QUOTE_APPROVAL_REVERTED, {
      quoteId: quote.id,
      quoteStatus: quote.status,
    });
  }

  private undoRejectionsByApproval(revertedQuote: Quote, workOrderQuotes: Quote[]): Quote[] {
    const rejectedQuotes = workOrderQuotes.filter(
      (other) => other.replacedByQuoteId === revertedQuote.id,
    );

    rejectedQuotes.forEach((rejectedQuote) => rejectedQuote.undoRejectionByApproval());

    return rejectedQuotes;
  }

  private async updateQuotesStatuses(
    quoteRepository: IQuoteRepository,
    quotes: Quote[],
  ): Promise<void> {
    // Approval writes in the same order, so a concurrent writer of these rows waits and fails on
    // the version instead of deadlocking.
    const quotesSortedById = [...quotes].sort((a, b) => (a.id < b.id ? -1 : 1));

    for (const quote of quotesSortedById) {
      await quoteRepository.update(quote);
    }
  }
}
