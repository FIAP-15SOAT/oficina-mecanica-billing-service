import { Quote } from '@domain/entities/quote.entity';
import { ICreateQuoteUseCase } from '@application/ports/input/quote/create-quote.use-case.interface';
import { IFindQuoteByIdUseCase } from '@application/ports/input/quote/find-quote-by-id.use-case.interface';
import { IAddQuoteServiceUseCase } from '@application/ports/input/quote/add-quote-service.use-case.interface';
import { IRemoveQuoteServiceUseCase } from '@application/ports/input/quote/remove-quote-service.use-case.interface';
import { IAddQuotePartSupplyUseCase } from '@application/ports/input/quote/add-quote-part-supply.use-case.interface';
import { IRemoveQuotePartSupplyUseCase } from '@application/ports/input/quote/remove-quote-part-supply.use-case.interface';
import { IUpdateQuoteServiceQuantityUseCase } from '@application/ports/input/quote/update-quote-service-quantity.use-case.interface';
import { IUpdateQuotePartSupplyQuantityUseCase } from '@application/ports/input/quote/update-quote-part-supply-quantity.use-case.interface';
import { IFindAllQuotesPaginatedUseCase } from '@application/ports/input/quote/find-all-quotes-paginated.use-case.interface';
import { IFindWorkOrderQuotesUseCase } from '@application/ports/input/quote/find-work-order-quotes.use-case.interface';
import { IFindWorkOrdersByIdsUseCase } from '@application/ports/input/quote/find-work-orders-by-ids.use-case.interface';
import { IFindQuoteItemsCatalogUseCase } from '@application/ports/input/quote/find-quote-items-catalog.use-case.interface';
import { ISubmitQuoteUseCase } from '@application/ports/input/quote/submit-quote.use-case.interface';
import { IUpdateQuoteStatusUseCase } from '@application/ports/input/quote/update-quote-status.use-case.interface';

import { CreateQuoteRequest } from './requests/create-quote-request';
import { AddQuoteServiceRequest } from './requests/add-quote-service-request';
import { AddQuotePartSupplyRequest } from './requests/add-quote-part-supply-request';
import { UpdateQuoteServiceItemRequest } from './requests/update-quote-service-item-request';
import { UpdateQuotePartSupplyItemRequest } from './requests/update-quote-part-supply-item-request';
import { FindAllQuotesQuery } from './requests/find-all-quotes-query';
import { UpdateQuoteStatusRequest } from './requests/update-quote-status-request';

import { QuotePresenter } from './quote.presenter';
import {
  QuoteDataResponse,
  QuoteListResponse,
  QuoteWithItemsDataResponse,
  QuotePaginatedResponse,
} from './responses/quote.response';

export class QuoteController {
  constructor(
    private readonly createQuoteUseCase: ICreateQuoteUseCase,
    private readonly findQuoteByIdUseCase: IFindQuoteByIdUseCase,
    private readonly addQuoteServiceUseCase: IAddQuoteServiceUseCase,
    private readonly removeQuoteServiceUseCase: IRemoveQuoteServiceUseCase,
    private readonly addQuotePartSupplyUseCase: IAddQuotePartSupplyUseCase,
    private readonly removeQuotePartSupplyUseCase: IRemoveQuotePartSupplyUseCase,
    private readonly updateQuoteServiceQuantityUseCase: IUpdateQuoteServiceQuantityUseCase,
    private readonly updateQuotePartSupplyQuantityUseCase: IUpdateQuotePartSupplyQuantityUseCase,
    private readonly submitQuoteUseCase: ISubmitQuoteUseCase,
    private readonly updateQuoteStatusUseCase: IUpdateQuoteStatusUseCase,
    private readonly findAllQuotesPaginatedUseCase: IFindAllQuotesPaginatedUseCase,
    private readonly findWorkOrderQuotesUseCase: IFindWorkOrderQuotesUseCase,
    private readonly findWorkOrdersByIdsUseCase: IFindWorkOrdersByIdsUseCase,
    private readonly findQuoteItemsCatalogUseCase: IFindQuoteItemsCatalogUseCase,
  ) {}

  async findAll(query: FindAllQuotesQuery): Promise<QuotePaginatedResponse> {
    const result = await this.findAllQuotesPaginatedUseCase.execute({
      ...query,
      page: query.page ?? 1,
      limit: query.limit ?? 10,
    });

    const workOrders = await this.findWorkOrdersByIdsUseCase.execute(
      result.items.map((quote) => quote.workOrderId),
    );

    return QuotePresenter.toPaginatedResponse(result, workOrders);
  }

  async findWorkOrderQuotes(workOrderId: string): Promise<QuoteListResponse> {
    // The work order is read first so an unknown one answers 404 instead of an empty list.
    const workOrders = await this.findWorkOrdersByIdsUseCase.execute([workOrderId]);

    const quotes = await this.findWorkOrderQuotesUseCase.execute(workOrderId);

    return QuotePresenter.toListResponse(quotes, workOrders);
  }

  async create(input: CreateQuoteRequest): Promise<QuoteDataResponse> {
    return this.toDataResponse(await this.createQuoteUseCase.execute(input));
  }

  async findOne(id: string): Promise<QuoteWithItemsDataResponse> {
    const quote = await this.findQuoteByIdUseCase.execute(id);

    const [[workOrder], catalog] = await Promise.all([
      this.findWorkOrdersByIdsUseCase.execute([quote.workOrderId]),
      this.findQuoteItemsCatalogUseCase.execute(quote),
    ]);

    return QuotePresenter.toWithItemsResponse(quote, workOrder, catalog);
  }

  async addService(quoteId: string, input: AddQuoteServiceRequest): Promise<QuoteDataResponse> {
    return this.toDataResponse(await this.addQuoteServiceUseCase.execute({ quoteId, ...input }));
  }

  async updateService(
    quoteId: string,
    serviceId: string,
    input: UpdateQuoteServiceItemRequest,
  ): Promise<QuoteDataResponse> {
    const quote = await this.updateQuoteServiceQuantityUseCase.execute({
      quoteId,
      serviceId,
      ...input,
    });

    return this.toDataResponse(quote);
  }

  async removeService(quoteId: string, serviceId: string): Promise<void> {
    await this.removeQuoteServiceUseCase.execute(quoteId, serviceId);
  }

  async addPartSupply(
    quoteId: string,
    input: AddQuotePartSupplyRequest,
  ): Promise<QuoteDataResponse> {
    return this.toDataResponse(await this.addQuotePartSupplyUseCase.execute({ quoteId, ...input }));
  }

  async updatePartSupply(
    quoteId: string,
    partSupplyId: string,
    input: UpdateQuotePartSupplyItemRequest,
  ): Promise<QuoteDataResponse> {
    const quote = await this.updateQuotePartSupplyQuantityUseCase.execute({
      quoteId,
      partSupplyId,
      ...input,
    });

    return this.toDataResponse(quote);
  }

  async removePartSupply(quoteId: string, partSupplyId: string): Promise<void> {
    await this.removeQuotePartSupplyUseCase.execute(quoteId, partSupplyId);
  }

  async submit(quoteId: string, sentBy: string): Promise<QuoteDataResponse> {
    return this.toDataResponse(await this.submitQuoteUseCase.execute(quoteId, sentBy));
  }

  async updateStatus(
    quoteId: string,
    decidedBy: string,
    input: UpdateQuoteStatusRequest,
  ): Promise<QuoteDataResponse> {
    return this.toDataResponse(
      await this.updateQuoteStatusUseCase.execute(quoteId, decidedBy, input),
    );
  }

  private async toDataResponse(quote: Quote): Promise<QuoteDataResponse> {
    const [workOrder] = await this.findWorkOrdersByIdsUseCase.execute([quote.workOrderId]);

    return QuotePresenter.toDataResponse(quote, workOrder);
  }
}
