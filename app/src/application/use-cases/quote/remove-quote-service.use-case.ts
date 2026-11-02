import { Quote } from '@domain/entities/quote.entity';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { IRemoveQuoteServiceUseCase } from '@application/ports/input/quote/remove-quote-service.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class RemoveQuoteServiceUseCase implements IRemoveQuoteServiceUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly cache: ICache,
  ) {}

  async execute(quoteId: string, serviceId: string): Promise<Quote> {
    const updated = await this.unitOfWork.executeTransaction(async (repos) => {
      const quote = await repos.quote.findByIdWithDetails(quoteId);

      if (!quote) {
        throw new ResourceNotFoundException('Orçamento', quoteId);
      }

      quote.removeService(serviceId);

      await repos.quote.removeServiceItem(quoteId, serviceId);
      return repos.quote.update(quote);
    });

    await this.cache.delete([
      billingCacheKeys.quote(updated.id),
      billingCacheKeys.workOrderQuotes(updated.workOrderId),
    ]);

    return updated;
  }
}
