import { Quote } from '@domain/entities/quote.entity';
import { PaginatedResult } from '@domain/interfaces/common/pagination.interface';
import { FindAllQuotesPaginatedInput } from './dto/find-all-quotes-paginated.dto';

export interface IFindAllQuotesPaginatedUseCase {
  execute(filters: FindAllQuotesPaginatedInput): Promise<PaginatedResult<Quote>>;
}
