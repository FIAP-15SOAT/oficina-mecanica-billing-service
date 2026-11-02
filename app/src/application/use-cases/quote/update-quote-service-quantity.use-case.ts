import { Quote } from '@domain/entities/quote.entity';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { UpdateQuoteServiceQuantityDto } from '@application/ports/input/quote/dto/update-quote-service-quantity.dto';
import { IUpdateQuoteServiceQuantityUseCase } from '@application/ports/input/quote/update-quote-service-quantity.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class UpdateQuoteServiceQuantityUseCase implements IUpdateQuoteServiceQuantityUseCase {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly cache: ICache,
  ) {}

  async execute(dto: UpdateQuoteServiceQuantityDto): Promise<Quote> {
    const updated = await this.unitOfWork.executeTransaction(async (repos) => {
      const quote = await repos.quote.findByIdWithDetails(dto.quoteId);

      if (!quote) {
        throw new ResourceNotFoundException('Orçamento', dto.quoteId);
      }

      const item = quote.updateServiceQuantity(dto.serviceId, dto.quantity);

      await repos.quote.updateServiceItemQuantity(item);
      return repos.quote.update(quote);
    });

    await this.cache.delete([
      billingCacheKeys.quote(updated.id),
      billingCacheKeys.workOrderQuotes(updated.workOrderId),
    ]);

    return updated;
  }
}
