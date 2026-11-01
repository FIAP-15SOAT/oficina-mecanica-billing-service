import { randomUUID } from 'node:crypto';

import { InternalQuoteController } from '@interface-adapters/quote/internal-quote.controller';
import { QuotePresenter } from '@interface-adapters/quote/quote.presenter';

import { QuoteDecisionAction } from '@domain/enums/quote-decision-action.enum';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

import { ICreateInitialQuoteUseCase } from '@application/ports/input/quote/create-initial-quote.use-case.interface';
import { IDeleteQuoteUseCase } from '@application/ports/input/quote/delete-quote.use-case.interface';
import { IFindQuoteByIdUseCase } from '@application/ports/input/quote/find-quote-by-id.use-case.interface';
import { IFindWorkOrderQuotesUseCase } from '@application/ports/input/quote/find-work-order-quotes.use-case.interface';
import { IDecideQuoteUseCase } from '@application/ports/input/quote/decide-quote.use-case.interface';
import { IFindQuoteItemsCatalogUseCase } from '@application/ports/input/quote/find-quote-items-catalog.use-case.interface';
import { ICheckServiceQuoteUsageUseCase } from '@application/ports/input/quote/check-service-quote-usage.use-case.interface';
import { ICheckPartSupplyQuoteUsageUseCase } from '@application/ports/input/quote/check-part-supply-quote-usage.use-case.interface';

import { createMockInventoryServiceGatewayResponse } from '../../../helpers/inventory-catalog-gateway-mock.factory';
import { createMockQuote, createMockQuoteService } from '../../../helpers/quote-mock.factory';

describe('InternalQuoteController', () => {
  let createInitialQuoteUseCase: jest.Mocked<ICreateInitialQuoteUseCase>;
  let deleteQuoteUseCase: jest.Mocked<IDeleteQuoteUseCase>;
  let findQuoteByIdUseCase: jest.Mocked<IFindQuoteByIdUseCase>;
  let findWorkOrderQuotesUseCase: jest.Mocked<IFindWorkOrderQuotesUseCase>;
  let decideQuoteUseCase: jest.Mocked<IDecideQuoteUseCase>;
  let findQuoteItemsCatalogUseCase: jest.Mocked<IFindQuoteItemsCatalogUseCase>;
  let checkServiceQuoteUsageUseCase: jest.Mocked<ICheckServiceQuoteUsageUseCase>;
  let checkPartSupplyQuoteUsageUseCase: jest.Mocked<ICheckPartSupplyQuoteUsageUseCase>;
  let controller: InternalQuoteController;

  beforeEach(() => {
    createInitialQuoteUseCase = { execute: jest.fn() };

    deleteQuoteUseCase = { execute: jest.fn() };

    findQuoteByIdUseCase = { execute: jest.fn() };

    findWorkOrderQuotesUseCase = { execute: jest.fn() };

    decideQuoteUseCase = { execute: jest.fn() };

    findQuoteItemsCatalogUseCase = { execute: jest.fn() };

    checkServiceQuoteUsageUseCase = { execute: jest.fn() };

    checkPartSupplyQuoteUsageUseCase = { execute: jest.fn() };

    controller = new InternalQuoteController(
      createInitialQuoteUseCase,
      deleteQuoteUseCase,
      findQuoteByIdUseCase,
      findWorkOrderQuotesUseCase,
      decideQuoteUseCase,
      findQuoteItemsCatalogUseCase,
      checkServiceQuoteUsageUseCase,
      checkPartSupplyQuoteUsageUseCase,
    );
  });

  it('should create the initial quote and answer with the work order id', async () => {
    const quote = createMockQuote();
    const input = { workOrderId: quote.workOrderId };

    createInitialQuoteUseCase.execute.mockResolvedValue(quote);

    await expect(controller.createInitial(input)).resolves.toEqual(
      QuotePresenter.toInternalDataResponse(quote),
    );

    expect(createInitialQuoteUseCase.execute).toHaveBeenCalledWith(input);
  });

  it('should delete a quote', async () => {
    deleteQuoteUseCase.execute.mockResolvedValue(undefined);

    await expect(controller.delete('quote-id')).resolves.toBeUndefined();
    expect(deleteQuoteUseCase.execute).toHaveBeenCalledWith('quote-id');
  });

  it('should show a quote with the inventory display data', async () => {
    const service = createMockInventoryServiceGatewayResponse();

    const quote = createMockQuote({
      services: [createMockQuoteService({ serviceId: service.id })],
    });

    const catalog = { services: [service], partsSupplies: [] };

    findQuoteByIdUseCase.execute.mockResolvedValue(quote);
    findQuoteItemsCatalogUseCase.execute.mockResolvedValue(catalog);

    await expect(controller.findOne(quote.id)).resolves.toEqual(
      QuotePresenter.toInternalWithItemsResponse(quote, catalog),
    );

    expect(findQuoteItemsCatalogUseCase.execute).toHaveBeenCalledWith(quote);
  });

  it('should list the quotes of a work order', async () => {
    const quote = createMockQuote();

    findWorkOrderQuotesUseCase.execute.mockResolvedValue([quote]);

    await expect(controller.findWorkOrderQuotes(quote.workOrderId)).resolves.toEqual(
      QuotePresenter.toInternalListResponse([quote]),
    );

    expect(findWorkOrderQuotesUseCase.execute).toHaveBeenCalledWith(quote.workOrderId);
  });

  it('should read the items before deciding and answer with the decided quote', async () => {
    const sent = createMockQuote({ status: QuoteStatus.SENT });
    const approved = createMockQuote({ status: QuoteStatus.APPROVED });
    const catalog = { services: [], partsSupplies: [] };
    const input = { action: QuoteDecisionAction.APPROVE, decidedBy: randomUUID() };

    findQuoteByIdUseCase.execute.mockResolvedValue(sent);
    findQuoteItemsCatalogUseCase.execute.mockResolvedValue(catalog);
    decideQuoteUseCase.execute.mockResolvedValue(approved);

    await expect(controller.decide(sent.id, input)).resolves.toEqual(
      QuotePresenter.toInternalWithItemsResponse(approved, catalog),
    );

    expect(findQuoteItemsCatalogUseCase.execute).toHaveBeenCalledWith(sent);
    expect(decideQuoteUseCase.execute).toHaveBeenCalledWith(sent.id, input);
  });

  it('should not decide the quote when the inventory cannot be read', async () => {
    const failure = new Error('inventory service unavailable');
    const input = { action: QuoteDecisionAction.APPROVE, decidedBy: randomUUID() };

    findQuoteByIdUseCase.execute.mockResolvedValue(createMockQuote({ status: QuoteStatus.SENT }));
    findQuoteItemsCatalogUseCase.execute.mockRejectedValue(failure);

    await expect(controller.decide('quote-id', input)).rejects.toBe(failure);

    expect(decideQuoteUseCase.execute).not.toHaveBeenCalled();
  });

  it('should answer whether a quote uses the service', async () => {
    checkServiceQuoteUsageUseCase.execute.mockResolvedValue(true);

    await expect(controller.findServiceQuoteUsage('service-id')).resolves.toEqual({
      data: { inUse: true },
    });

    expect(checkServiceQuoteUsageUseCase.execute).toHaveBeenCalledWith('service-id');
  });

  it('should answer whether a quote uses the part supply', async () => {
    checkPartSupplyQuoteUsageUseCase.execute.mockResolvedValue(false);

    await expect(controller.findPartSupplyQuoteUsage('part-supply-id')).resolves.toEqual({
      data: { inUse: false },
    });

    expect(checkPartSupplyQuoteUsageUseCase.execute).toHaveBeenCalledWith('part-supply-id');
  });
});
