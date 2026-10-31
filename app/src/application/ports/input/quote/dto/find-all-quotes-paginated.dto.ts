import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { PaginationInput } from '@domain/interfaces/common/pagination.interface';

export interface FindAllQuotesPaginatedInput extends PaginationInput {
  workOrderId?: string;
  status?: QuoteStatus;
}
