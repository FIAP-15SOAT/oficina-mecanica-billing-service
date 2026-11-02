import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { PaginationQuery } from '@domain/interfaces/common/pagination.interface';

export interface FindAllQuotesQuery extends PaginationQuery {
  workOrderId?: string;
  status?: QuoteStatus;
}
