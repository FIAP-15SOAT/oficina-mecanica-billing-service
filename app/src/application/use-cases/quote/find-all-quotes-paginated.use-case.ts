import { Quote } from '@domain/entities/quote.entity';

import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IFindAllQuotesPaginatedUseCase } from '@application/ports/input/quote/find-all-quotes-paginated.use-case.interface';

import { PaginatedResult } from '@domain/interfaces/common/pagination.interface';
import { FindAllQuotesPaginatedInput } from '@application/ports/input/quote/dto/find-all-quotes-paginated.dto';

import { buildPaginatedResult } from '@application/utils/pagination.util';

export class FindAllQuotesPaginatedUseCase implements IFindAllQuotesPaginatedUseCase {
  constructor(private readonly quoteRepository: IQuoteRepository) {}

  async execute(input: FindAllQuotesPaginatedInput): Promise<PaginatedResult<Quote>> {
    const { page, limit, ...filters } = input;
    const pagination = { page, limit };

    const result = await this.quoteRepository.findAllPaginated(pagination, filters);

    return buildPaginatedResult(result, pagination);
  }
}
