import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { IDeleteQuoteUseCase } from '@application/ports/input/quote/delete-quote.use-case.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class DeleteQuoteUseCase implements IDeleteQuoteUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly cache: ICache,
  ) {}

  async execute(id: string): Promise<void> {
    const quote = await this.quoteRepository.findById(id);

    if (!quote) {
      throw new ResourceNotFoundException('Orçamento', id);
    }

    quote.ensureCanDelete();

    await this.quoteRepository.delete(quote.id);

    await this.cache.delete([
      billingCacheKeys.quote(quote.id),
      billingCacheKeys.workOrderQuotes(quote.workOrderId),
    ]);
  }
}
