import { Quote } from '@domain/entities/quote.entity';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { ICreateInitialQuoteUseCase } from '@application/ports/input/quote/create-initial-quote.use-case.interface';
import { CreateQuoteDto } from '@application/ports/input/quote/dto/create-quote.dto';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { QuoteItemValidator } from '@application/services/quote-item-validator';

export class CreateInitialQuoteUseCase implements ICreateInitialQuoteUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly quoteItemValidator: QuoteItemValidator,
    private readonly cache: ICache,
  ) {}

  async execute(dto: CreateQuoteDto): Promise<Quote> {
    const { services, partsSupplies } = await this.quoteItemValidator.validateAndResolve(
      dto.services ?? [],
      dto.partsSupplies ?? [],
    );

    // A quote already there means the opening repeated. The initial quote is the oldest: later
    // ones need the work order saved, and the list comes newest first.
    const initialQuote = (await this.quoteRepository.findByWorkOrderId(dto.workOrderId)).at(-1);

    if (initialQuote) {
      return initialQuote;
    }

    const quote = await this.quoteRepository.create(
      Quote.create({ workOrderId: dto.workOrderId, notes: dto.notes, services, partsSupplies }),
    );

    await this.cache.delete([billingCacheKeys.workOrderQuotes(dto.workOrderId)]);

    return quote;
  }
}
