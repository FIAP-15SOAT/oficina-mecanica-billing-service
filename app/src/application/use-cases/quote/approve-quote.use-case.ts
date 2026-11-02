import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { IApproveQuoteUseCase } from '@application/ports/input/quote/approve-quote.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';

export class ApproveQuoteUseCase implements IApproveQuoteUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly quoteWorkOrderPolicy: QuoteWorkOrderPolicy,
    private readonly logger: ILogger,
    private readonly cache: ICache,
  ) {}

  async execute(quoteId: string, decidedBy: string): Promise<Quote> {
    const { quote, rejectedQuotes } = await this.unitOfWork.executeTransaction(async (repos) => {
      const quote = await repos.quote.findByIdWithDetails(quoteId);

      if (!quote) {
        throw new ResourceNotFoundException('Orçamento', quoteId);
      }

      const workOrderQuotes = await repos.quote.findByWorkOrderId(quote.workOrderId);
      const otherWorkOrderQuotes = workOrderQuotes.filter((other) => other.id !== quote.id);

      this.quoteWorkOrderPolicy.ensureNoApprovedQuote(otherWorkOrderQuotes);

      quote.approve(decidedBy);

      const rejectedQuotes = this.rejectOpenQuotes(quote, otherWorkOrderQuotes);

      await this.updateQuotesStatuses(repos.quote, [quote, ...rejectedQuotes]);

      await repos.outbox.add({
        type: 'billing.quote.approved',
        workOrderId: quote.workOrderId,
        payload: {
          quoteId: quote.id,
          decidedBy,
          total: quote.totalAmount.toFixed(2),
          services: quote.services.map((item) => ({
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toFixed(2),
          })),
          partsSupplies: quote.partsSupplies.map((item) => ({
            partSupplyId: item.partSupplyId,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toFixed(2),
          })),
        },
      });

      return { quote, rejectedQuotes };
    });

    await this.cache.delete([
      billingCacheKeys.quote(quote.id),
      ...rejectedQuotes.map((rejectedQuote) => billingCacheKeys.quote(rejectedQuote.id)),
      billingCacheKeys.workOrderQuotes(quote.workOrderId),
    ]);

    this.logger.event(BUSINESS_EVENTS.QUOTE_APPROVED, {
      quoteId: quote.id,
      workOrderId: quote.workOrderId,
    });

    return quote;
  }

  private rejectOpenQuotes(approvedQuote: Quote, otherWorkOrderQuotes: Quote[]): Quote[] {
    const openQuotes = otherWorkOrderQuotes.filter(
      (other) => other.status === QuoteStatus.PENDING || other.status === QuoteStatus.SENT,
    );

    openQuotes.forEach((openQuote) => openQuote.rejectByApprovalOf(approvedQuote.id));

    return openQuotes;
  }

  private async updateQuotesStatuses(
    quoteRepository: IQuoteRepository,
    quotes: Quote[],
  ): Promise<void> {
    // Every approval writes in the same order, so two concurrent ones wait and fail on the
    // version (409) instead of deadlocking on each other's rows (500).
    const quotesSortedById = [...quotes].sort((a, b) => (a.id < b.id ? -1 : 1));

    for (const quote of quotesSortedById) {
      await quoteRepository.update(quote);
    }
  }
}
