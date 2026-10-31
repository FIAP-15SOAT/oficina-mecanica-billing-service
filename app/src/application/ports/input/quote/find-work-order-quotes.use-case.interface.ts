import { Quote } from '@domain/entities/quote.entity';

export interface IFindWorkOrderQuotesUseCase {
  execute(workOrderId: string): Promise<Quote[]>;
}
