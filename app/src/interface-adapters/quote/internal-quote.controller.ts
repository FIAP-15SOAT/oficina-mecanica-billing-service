import { Quote } from '@domain/entities/quote.entity';
import { ICreateInitialQuoteUseCase } from '@application/ports/input/quote/create-initial-quote.use-case.interface';
import { IDeleteQuoteUseCase } from '@application/ports/input/quote/delete-quote.use-case.interface';
import { IFindQuoteByIdUseCase } from '@application/ports/input/quote/find-quote-by-id.use-case.interface';
import { IFindWorkOrderQuotesUseCase } from '@application/ports/input/quote/find-work-order-quotes.use-case.interface';
import { IDecideQuoteUseCase } from '@application/ports/input/quote/decide-quote.use-case.interface';
import { IFindQuoteItemsCatalogUseCase } from '@application/ports/input/quote/find-quote-items-catalog.use-case.interface';
import { ICheckServiceQuoteUsageUseCase } from '@application/ports/input/quote/check-service-quote-usage.use-case.interface';
import { ICheckPartSupplyQuoteUsageUseCase } from '@application/ports/input/quote/check-part-supply-quote-usage.use-case.interface';

import { CreateQuoteRequest } from './requests/create-quote-request';
import { DecideQuoteRequest } from './requests/decide-quote-request';

import { QuotePresenter } from './quote.presenter';
import {
  InternalQuoteDataResponse,
  InternalQuoteListResponse,
  InternalQuoteUsageDataResponse,
  InternalQuoteWithItemsDataResponse,
} from './responses/internal-quote.response';

// Internal routes answer with workOrderId instead of the work order summary, so the work order
// service calling them is never called back.
export class InternalQuoteController {
  constructor(
    private readonly createInitialQuoteUseCase: ICreateInitialQuoteUseCase,
    private readonly deleteQuoteUseCase: IDeleteQuoteUseCase,
    private readonly findQuoteByIdUseCase: IFindQuoteByIdUseCase,
    private readonly findWorkOrderQuotesUseCase: IFindWorkOrderQuotesUseCase,
    private readonly decideQuoteUseCase: IDecideQuoteUseCase,
    private readonly findQuoteItemsCatalogUseCase: IFindQuoteItemsCatalogUseCase,
    private readonly checkServiceQuoteUsageUseCase: ICheckServiceQuoteUsageUseCase,
    private readonly checkPartSupplyQuoteUsageUseCase: ICheckPartSupplyQuoteUsageUseCase,
  ) {}

  async createInitial(input: CreateQuoteRequest): Promise<InternalQuoteDataResponse> {
    return QuotePresenter.toInternalDataResponse(
      await this.createInitialQuoteUseCase.execute(input),
    );
  }

  async delete(id: string): Promise<void> {
    await this.deleteQuoteUseCase.execute(id);
  }

  async findOne(id: string): Promise<InternalQuoteWithItemsDataResponse> {
    return this.toWithItemsResponse(await this.findQuoteByIdUseCase.execute(id));
  }

  async findWorkOrderQuotes(workOrderId: string): Promise<InternalQuoteListResponse> {
    return QuotePresenter.toInternalListResponse(
      await this.findWorkOrderQuotesUseCase.execute(workOrderId),
    );
  }

  async decide(id: string, input: DecideQuoteRequest): Promise<InternalQuoteWithItemsDataResponse> {
    // Read before the decision, so an unavailable inventory fails it with nothing saved; only a
    // SENT quote can be decided, and its items no longer change.
    const catalog = await this.findQuoteItemsCatalogUseCase.execute(
      await this.findQuoteByIdUseCase.execute(id),
    );

    const quote = await this.decideQuoteUseCase.execute(id, input);

    return QuotePresenter.toInternalWithItemsResponse(quote, catalog);
  }

  async findServiceQuoteUsage(serviceId: string): Promise<InternalQuoteUsageDataResponse> {
    return QuotePresenter.toInternalUsageDataResponse(
      await this.checkServiceQuoteUsageUseCase.execute(serviceId),
    );
  }

  async findPartSupplyQuoteUsage(partSupplyId: string): Promise<InternalQuoteUsageDataResponse> {
    return QuotePresenter.toInternalUsageDataResponse(
      await this.checkPartSupplyQuoteUsageUseCase.execute(partSupplyId),
    );
  }

  private async toWithItemsResponse(quote: Quote): Promise<InternalQuoteWithItemsDataResponse> {
    const catalog = await this.findQuoteItemsCatalogUseCase.execute(quote);

    return QuotePresenter.toInternalWithItemsResponse(quote, catalog);
  }
}
