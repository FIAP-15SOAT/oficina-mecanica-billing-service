import { Quote } from '@domain/entities/quote.entity';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { ICreateQuoteUseCase } from '@application/ports/input/quote/create-quote.use-case.interface';
import { CreateQuoteDto } from '@application/ports/input/quote/dto/create-quote.dto';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { QuoteItemValidator } from '@application/services/quote-item-validator';

export class CreateQuoteUseCase implements ICreateQuoteUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly quoteWorkOrderPolicy: QuoteWorkOrderPolicy,
    private readonly quoteItemValidator: QuoteItemValidator,
    private readonly cache: ICache,
  ) {}

  async execute(dto: CreateQuoteDto): Promise<Quote> {
    await this.quoteWorkOrderPolicy.ensureCanCreateQuote(dto.workOrderId);

    const { services, partsSupplies } = await this.quoteItemValidator.validateAndResolve(
      dto.services ?? [],
      dto.partsSupplies ?? [],
    );

    this.quoteWorkOrderPolicy.ensureNoApprovedQuote(
      await this.quoteRepository.findByWorkOrderId(dto.workOrderId),
    );

    const quote = await this.quoteRepository.create(
      Quote.create({ workOrderId: dto.workOrderId, notes: dto.notes, services, partsSupplies }),
    );

    await this.cache.delete([billingCacheKeys.workOrderQuotes(dto.workOrderId)]);

    return quote;
  }
}
