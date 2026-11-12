import { QuoteController } from '@interface-adapters/quote/quote.controller';
import { QuotePresenter } from '@interface-adapters/quote/quote.presenter';

import { QuoteStatus } from '@domain/enums/quote-status.enum';

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
import { IFindExistingWorkOrdersUseCase } from '@application/ports/input/quote/find-existing-work-orders.use-case.interface';
import { IFindQuoteItemsCatalogUseCase } from '@application/ports/input/quote/find-quote-items-catalog.use-case.interface';
import { ISubmitQuoteUseCase } from '@application/ports/input/quote/submit-quote.use-case.interface';
import { IUpdateQuoteStatusUseCase } from '@application/ports/input/quote/update-quote-status.use-case.interface';
import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';

import { createMockInventoryServiceGatewayResponse } from '../../../helpers/inventory-catalog-gateway-mock.factory';
import { createMockQuote, createMockQuoteService } from '../../../helpers/quote-mock.factory';
import { createMockWorkOrderGatewayResponse } from '../../../helpers/work-order-gateway-mock.factory';

describe('QuoteController', () => {
  const workOrder = createMockWorkOrderGatewayResponse();
  const quote = createMockQuote({ workOrderId: workOrder.id });

  let createQuoteUseCase: jest.Mocked<ICreateQuoteUseCase>;
  let findQuoteByIdUseCase: jest.Mocked<IFindQuoteByIdUseCase>;
  let addQuoteServiceUseCase: jest.Mocked<IAddQuoteServiceUseCase>;
  let removeQuoteServiceUseCase: jest.Mocked<IRemoveQuoteServiceUseCase>;
  let addQuotePartSupplyUseCase: jest.Mocked<IAddQuotePartSupplyUseCase>;
  let removeQuotePartSupplyUseCase: jest.Mocked<IRemoveQuotePartSupplyUseCase>;
  let updateQuoteServiceQuantityUseCase: jest.Mocked<IUpdateQuoteServiceQuantityUseCase>;
  let updateQuotePartSupplyQuantityUseCase: jest.Mocked<IUpdateQuotePartSupplyQuantityUseCase>;
  let submitQuoteUseCase: jest.Mocked<ISubmitQuoteUseCase>;
  let updateQuoteStatusUseCase: jest.Mocked<IUpdateQuoteStatusUseCase>;
  let findAllQuotesPaginatedUseCase: jest.Mocked<IFindAllQuotesPaginatedUseCase>;
  let findWorkOrderQuotesUseCase: jest.Mocked<IFindWorkOrderQuotesUseCase>;
  let findWorkOrdersByIdsUseCase: jest.Mocked<IFindWorkOrdersByIdsUseCase>;
  let findExistingWorkOrdersUseCase: jest.Mocked<IFindExistingWorkOrdersUseCase>;
  let findQuoteItemsCatalogUseCase: jest.Mocked<IFindQuoteItemsCatalogUseCase>;
  let controller: QuoteController;

  beforeEach(() => {
    createQuoteUseCase = { execute: jest.fn() };

    findQuoteByIdUseCase = { execute: jest.fn().mockResolvedValue(quote) };

    addQuoteServiceUseCase = { execute: jest.fn() };

    removeQuoteServiceUseCase = { execute: jest.fn() };

    addQuotePartSupplyUseCase = { execute: jest.fn() };

    removeQuotePartSupplyUseCase = { execute: jest.fn() };

    updateQuoteServiceQuantityUseCase = { execute: jest.fn() };

    updateQuotePartSupplyQuantityUseCase = { execute: jest.fn() };

    submitQuoteUseCase = { execute: jest.fn() };

    updateQuoteStatusUseCase = { execute: jest.fn() };

    findAllQuotesPaginatedUseCase = { execute: jest.fn() };

    findWorkOrderQuotesUseCase = { execute: jest.fn() };

    findWorkOrdersByIdsUseCase = { execute: jest.fn().mockResolvedValue([workOrder]) };

    findExistingWorkOrdersUseCase = { execute: jest.fn().mockResolvedValue([workOrder]) };

    findQuoteItemsCatalogUseCase = { execute: jest.fn() };

    controller = new QuoteController(
      createQuoteUseCase,
      findQuoteByIdUseCase,
      addQuoteServiceUseCase,
      removeQuoteServiceUseCase,
      addQuotePartSupplyUseCase,
      removeQuotePartSupplyUseCase,
      updateQuoteServiceQuantityUseCase,
      updateQuotePartSupplyQuantityUseCase,
      submitQuoteUseCase,
      updateQuoteStatusUseCase,
      findAllQuotesPaginatedUseCase,
      findWorkOrderQuotesUseCase,
      findWorkOrdersByIdsUseCase,
      findExistingWorkOrdersUseCase,
      findQuoteItemsCatalogUseCase,
    );
  });

  it('should create a quote and embed its work order', async () => {
    const input = { workOrderId: workOrder.id, notes: 'test' };

    createQuoteUseCase.execute.mockResolvedValue(quote);

    await expect(controller.create(input)).resolves.toEqual(
      QuotePresenter.toDataResponse(quote, workOrder),
    );

    expect(createQuoteUseCase.execute).toHaveBeenCalledWith(input);
    expect(findWorkOrdersByIdsUseCase.execute).toHaveBeenCalledWith([workOrder.id]);
  });

  it('should not create the quote when the work order cannot be read', async () => {
    const failure = new Error('work order service unavailable');

    findWorkOrdersByIdsUseCase.execute.mockRejectedValue(failure);

    await expect(controller.create({ workOrderId: workOrder.id })).rejects.toBe(failure);

    expect(createQuoteUseCase.execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      'add a service',
      () => controller.addService(quote.id, { serviceId: 'service-id', quantity: 2 }),
      () => addQuoteServiceUseCase,
    ],
    [
      'update the quantity of a service',
      () => controller.updateService(quote.id, 'service-id', { quantity: 3 }),
      () => updateQuoteServiceQuantityUseCase,
    ],
    [
      'add a part supply',
      () => controller.addPartSupply(quote.id, { partSupplyId: 'part-id', quantity: 1 }),
      () => addQuotePartSupplyUseCase,
    ],
    [
      'update the quantity of a part supply',
      () => controller.updatePartSupply(quote.id, 'part-id', { quantity: 4 }),
      () => updateQuotePartSupplyQuantityUseCase,
    ],
    ['submit the quote', () => controller.submit(quote.id, 'sender-id'), () => submitQuoteUseCase],
    [
      'decide the quote',
      () =>
        controller.updateStatus(quote.id, 'decider-id', {
          status: QuoteStatus.REJECTED,
          reason: 'Preço elevado',
        }),
      () => updateQuoteStatusUseCase,
    ],
  ])('should not %s when the work order of the quote cannot be read', async (_, write, useCase) => {
    const failure = new Error('work order service unavailable');

    findWorkOrdersByIdsUseCase.execute.mockRejectedValue(failure);

    await expect(write()).rejects.toBe(failure);

    expect(findQuoteByIdUseCase.execute).toHaveBeenCalledWith(quote.id);
    expect(findWorkOrdersByIdsUseCase.execute).toHaveBeenCalledWith([quote.workOrderId]);
    expect(useCase().execute).not.toHaveBeenCalled();
  });

  it('should show a quote with its work order and the inventory display data', async () => {
    const service = createMockInventoryServiceGatewayResponse();

    const detailed = createMockQuote({
      workOrderId: workOrder.id,
      services: [createMockQuoteService({ serviceId: service.id })],
    });

    const catalog = { services: [service], partsSupplies: [] };

    findQuoteByIdUseCase.execute.mockResolvedValue(detailed);
    findQuoteItemsCatalogUseCase.execute.mockResolvedValue(catalog);

    await expect(controller.findOne(detailed.id)).resolves.toEqual(
      QuotePresenter.toWithItemsResponse(detailed, workOrder, catalog),
    );

    expect(findQuoteItemsCatalogUseCase.execute).toHaveBeenCalledWith(detailed);
  });

  it('should apply the pagination defaults', async () => {
    findAllQuotesPaginatedUseCase.execute.mockResolvedValue({
      items: [quote],
      pagination: { totalRecords: 1, totalPages: 1, page: 1, limit: 10 },
    });

    await controller.findAll({ status: QuoteStatus.PENDING });

    expect(findAllQuotesPaginatedUseCase.execute).toHaveBeenCalledWith({
      status: QuoteStatus.PENDING,
      page: 1,
      limit: 10,
    });
  });

  it('should read the existing work orders of a list page', async () => {
    const quotes = [quote, createMockQuote({ workOrderId: workOrder.id })];

    findAllQuotesPaginatedUseCase.execute.mockResolvedValue({
      items: quotes,
      pagination: { totalRecords: 2, totalPages: 1, page: 2, limit: 5 },
    });

    const response = await controller.findAll({ page: 2, limit: 5 });

    expect(findExistingWorkOrdersUseCase.execute).toHaveBeenCalledTimes(1);
    expect(findExistingWorkOrdersUseCase.execute).toHaveBeenCalledWith([
      workOrder.id,
      workOrder.id,
    ]);
    expect(findWorkOrdersByIdsUseCase.execute).not.toHaveBeenCalled();
    expect(response.data.map((item) => item.workOrder?.id)).toEqual([workOrder.id, workOrder.id]);
  });

  it('should list the quotes of a work order', async () => {
    findWorkOrderQuotesUseCase.execute.mockResolvedValue([quote]);

    await expect(controller.findWorkOrderQuotes(workOrder.id)).resolves.toEqual(
      QuotePresenter.toListResponse([quote], [workOrder]),
    );
  });

  it('should answer 404 for an unknown work order before reading its quotes', async () => {
    const notFound = new ServiceRequestRejectedException(404, 'Ordem de Serviço não encontrado(a)');

    findWorkOrdersByIdsUseCase.execute.mockRejectedValue(notFound);

    await expect(controller.findWorkOrderQuotes('unknown-id')).rejects.toBe(notFound);
    expect(findWorkOrderQuotesUseCase.execute).not.toHaveBeenCalled();
  });

  it('should add a service to the quote', async () => {
    addQuoteServiceUseCase.execute.mockResolvedValue(quote);

    await controller.addService(quote.id, { serviceId: 'service-id', quantity: 2 });

    expect(addQuoteServiceUseCase.execute).toHaveBeenCalledWith({
      quoteId: quote.id,
      serviceId: 'service-id',
      quantity: 2,
    });
  });

  it('should update the quantity of a service', async () => {
    updateQuoteServiceQuantityUseCase.execute.mockResolvedValue(quote);

    await controller.updateService(quote.id, 'service-id', { quantity: 3 });

    expect(updateQuoteServiceQuantityUseCase.execute).toHaveBeenCalledWith({
      quoteId: quote.id,
      serviceId: 'service-id',
      quantity: 3,
    });
  });

  it('should remove a service from the quote', async () => {
    removeQuoteServiceUseCase.execute.mockResolvedValue(quote);

    await expect(controller.removeService(quote.id, 'service-id')).resolves.toBeUndefined();
    expect(removeQuoteServiceUseCase.execute).toHaveBeenCalledWith(quote.id, 'service-id');
  });

  it('should add a part supply to the quote', async () => {
    addQuotePartSupplyUseCase.execute.mockResolvedValue(quote);

    await controller.addPartSupply(quote.id, { partSupplyId: 'part-id', quantity: 1 });

    expect(addQuotePartSupplyUseCase.execute).toHaveBeenCalledWith({
      quoteId: quote.id,
      partSupplyId: 'part-id',
      quantity: 1,
    });
  });

  it('should update the quantity of a part supply', async () => {
    updateQuotePartSupplyQuantityUseCase.execute.mockResolvedValue(quote);

    await controller.updatePartSupply(quote.id, 'part-id', { quantity: 4 });

    expect(updateQuotePartSupplyQuantityUseCase.execute).toHaveBeenCalledWith({
      quoteId: quote.id,
      partSupplyId: 'part-id',
      quantity: 4,
    });
  });

  it('should remove a part supply from the quote', async () => {
    removeQuotePartSupplyUseCase.execute.mockResolvedValue(quote);

    await expect(controller.removePartSupply(quote.id, 'part-id')).resolves.toBeUndefined();
    expect(removeQuotePartSupplyUseCase.execute).toHaveBeenCalledWith(quote.id, 'part-id');
  });

  it('should submit the quote on behalf of the sender and embed its work order', async () => {
    submitQuoteUseCase.execute.mockResolvedValue(quote);

    await expect(controller.submit(quote.id, 'sender-id')).resolves.toEqual(
      QuotePresenter.toDataResponse(quote, workOrder),
    );

    expect(submitQuoteUseCase.execute).toHaveBeenCalledWith(quote.id, 'sender-id');
  });

  it('should update the quote status on behalf of the decider and embed its work order', async () => {
    const input = { status: QuoteStatus.REJECTED, reason: 'Preço elevado' } as const;

    updateQuoteStatusUseCase.execute.mockResolvedValue(quote);

    await expect(controller.updateStatus(quote.id, 'decider-id', input)).resolves.toEqual(
      QuotePresenter.toDataResponse(quote, workOrder),
    );

    expect(updateQuoteStatusUseCase.execute).toHaveBeenCalledWith(quote.id, 'decider-id', input);
  });
});
