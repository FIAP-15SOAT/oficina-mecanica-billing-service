import { Quote } from '@domain/entities/quote.entity';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { BillingMessagePayloads } from '@domain/messaging/billing.messages';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { ISubmitQuoteUseCase } from '@application/ports/input/quote/submit-quote.use-case.interface';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';

type SentQuoteItem = BillingMessagePayloads['billing.quote.sent']['items'][number];

export class SubmitQuoteUseCase implements ISubmitQuoteUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly quoteWorkOrderPolicy: QuoteWorkOrderPolicy,
    private readonly inventoryCatalogGateway: IInventoryCatalogGateway,
    private readonly logger: ILogger,
    private readonly cache: ICache,
  ) {}

  async execute(quoteId: string, sentBy: string): Promise<Quote> {
    const quote = await this.quoteRepository.findByIdWithDetails(quoteId);

    if (!quote) {
      throw new ResourceNotFoundException('Orçamento', quoteId);
    }

    await this.quoteWorkOrderPolicy.ensureCanSubmitQuote(quote.workOrderId);

    this.quoteWorkOrderPolicy.ensureNoApprovedQuote(
      await this.quoteRepository.findByWorkOrderId(quote.workOrderId),
    );

    quote.submit();

    const items = await this.findSentItems(quote);

    const submitted = await this.unitOfWork.executeTransaction(async (repos) => {
      // The version check rejects an item change or a sibling approval made after the read.
      const updated = await repos.quote.update(quote);

      await repos.outbox.add({
        type: 'billing.quote.sent',
        workOrderId: quote.workOrderId,
        payload: { quoteId: quote.id, sentBy, total: quote.totalAmount.toFixed(2), items },
      });

      return updated;
    });

    await this.cache.delete([
      billingCacheKeys.quote(quote.id),
      billingCacheKeys.workOrderQuotes(quote.workOrderId),
    ]);

    this.logger.event(BUSINESS_EVENTS.QUOTE_SUBMITTED, {
      quoteId: quote.id,
      workOrderId: quote.workOrderId,
    });

    return submitted;
  }

  private async findSentItems(quote: Quote): Promise<SentQuoteItem[]> {
    const [services, partsSupplies] = await Promise.all([
      this.inventoryCatalogGateway.findServicesByIds(quote.services.map((item) => item.serviceId)),
      this.inventoryCatalogGateway.findPartsSuppliesByIds(
        quote.partsSupplies.map((item) => item.partSupplyId),
      ),
    ]);

    return [
      ...quote.services.map((item) => ({
        name: this.findItemName(services, item.serviceId, 'Serviço'),
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      })),
      ...quote.partsSupplies.map((item) => ({
        name: this.findItemName(partsSupplies, item.partSupplyId, 'Peça/Insumo'),
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    ];
  }

  private findItemName(
    catalogItems: readonly { id: string; name: string }[],
    id: string,
    resourceName: string,
  ): string {
    const catalogItem = catalogItems.find((candidate) => candidate.id === id);

    if (!catalogItem) {
      throw new ResourceNotFoundException(resourceName, id);
    }

    return catalogItem.name;
  }
}
