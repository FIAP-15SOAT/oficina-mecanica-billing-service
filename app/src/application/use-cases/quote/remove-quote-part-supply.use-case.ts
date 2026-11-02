import { Quote } from '@domain/entities/quote.entity';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { IRemoveQuotePartSupplyUseCase } from '@application/ports/input/quote/remove-quote-part-supply.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class RemoveQuotePartSupplyUseCase implements IRemoveQuotePartSupplyUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly cache: ICache,
  ) {}

  async execute(quoteId: string, partSupplyId: string): Promise<Quote> {
    const updated = await this.unitOfWork.executeTransaction(async (repos) => {
      const quote = await repos.quote.findByIdWithDetails(quoteId);

      if (!quote) {
        throw new ResourceNotFoundException('Orçamento', quoteId);
      }

      quote.removePartSupply(partSupplyId);

      await repos.quote.removePartSupplyItem(quoteId, partSupplyId);
      return repos.quote.update(quote);
    });

    await this.cache.delete([
      billingCacheKeys.quote(updated.id),
      billingCacheKeys.workOrderQuotes(updated.workOrderId),
    ]);

    return updated;
  }
}
