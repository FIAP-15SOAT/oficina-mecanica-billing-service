import { QuoteController } from '@infrastructure/http/controllers/quote/quote.controller';
import { QuoteController as QuoteCleanController } from '@interface-adapters/quote/quote.controller';
import { QuotePresenter } from '@interface-adapters/quote/quote.presenter';

import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { UserRole } from '@domain/enums/user-role.enum';

import { CreateQuoteRequestDto } from '@infrastructure/http/controllers/quote/dto/requests/create-quote-request.dto';
import { AddQuoteServiceRequestDto } from '@infrastructure/http/controllers/quote/dto/requests/add-quote-service-request.dto';
import { AddQuotePartSupplyRequestDto } from '@infrastructure/http/controllers/quote/dto/requests/add-quote-part-supply-request.dto';
import { UpdateQuoteServiceItemRequestDto } from '@infrastructure/http/controllers/quote/dto/requests/update-quote-service-item-request.dto';
import { UpdateQuotePartSupplyItemRequestDto } from '@infrastructure/http/controllers/quote/dto/requests/update-quote-part-supply-item-request.dto';
import { FindAllQuotesQueryDto } from '@infrastructure/http/controllers/quote/dto/requests/find-all-quotes-query.dto';

import { createMockQuote } from '../../../../../helpers/quote-mock.factory';
import { createMockWorkOrderGatewayResponse } from '../../../../../helpers/work-order-gateway-mock.factory';

describe('QuoteController (http)', () => {
  const workOrder = createMockWorkOrderGatewayResponse();
  const quote = createMockQuote({ workOrderId: workOrder.id });
  const dataResponse = QuotePresenter.toDataResponse(quote, workOrder);

  let cleanController: QuoteCleanController;
  let httpController: QuoteController;

  beforeEach(() => {
    cleanController = new QuoteCleanController(
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
    );
    httpController = new QuoteController(cleanController);
  });

  it('should delegate the listing with the query', async () => {
    const query: FindAllQuotesQueryDto = { page: 1, limit: 10, status: QuoteStatus.PENDING };
    const response = QuotePresenter.toPaginatedResponse(
      { items: [quote], pagination: { totalRecords: 1, totalPages: 1, page: 1, limit: 10 } },
      [workOrder],
    );
    jest.spyOn(cleanController, 'findAll').mockResolvedValue(response);

    await expect(httpController.findAll(query)).resolves.toBe(response);
    expect(cleanController.findAll).toHaveBeenCalledWith(query);
  });

  it('should delegate the creation with the body', async () => {
    const request: CreateQuoteRequestDto = { workOrderId: workOrder.id, notes: 'test' };
    jest.spyOn(cleanController, 'create').mockResolvedValue(dataResponse);

    await expect(httpController.create(request)).resolves.toBe(dataResponse);
    expect(cleanController.create).toHaveBeenCalledWith(request);
  });

  it('should delegate the detail with the id', async () => {
    const response = QuotePresenter.toWithItemsResponse(quote, workOrder, {
      services: [],
      partsSupplies: [],
    });
    jest.spyOn(cleanController, 'findOne').mockResolvedValue(response);

    await expect(httpController.findOne(quote.id)).resolves.toBe(response);
    expect(cleanController.findOne).toHaveBeenCalledWith(quote.id);
  });

  it('should delegate the service routes', async () => {
    const addRequest: AddQuoteServiceRequestDto = { serviceId: 'service-id', quantity: 1 };
    const updateRequest: UpdateQuoteServiceItemRequestDto = { quantity: 2 };

    jest.spyOn(cleanController, 'addService').mockResolvedValue(dataResponse);
    jest.spyOn(cleanController, 'updateService').mockResolvedValue(dataResponse);
    jest.spyOn(cleanController, 'removeService').mockResolvedValue(undefined);

    await expect(httpController.addService(quote.id, addRequest)).resolves.toBe(dataResponse);
    await expect(httpController.updateService(quote.id, 'service-id', updateRequest)).resolves.toBe(
      dataResponse,
    );
    await expect(httpController.removeService(quote.id, 'service-id')).resolves.toBeUndefined();

    expect(cleanController.addService).toHaveBeenCalledWith(quote.id, addRequest);
    expect(cleanController.updateService).toHaveBeenCalledWith(
      quote.id,
      'service-id',
      updateRequest,
    );
    expect(cleanController.removeService).toHaveBeenCalledWith(quote.id, 'service-id');
  });

  it('should delegate the part supply routes', async () => {
    const addRequest: AddQuotePartSupplyRequestDto = { partSupplyId: 'part-id', quantity: 1 };
    const updateRequest: UpdateQuotePartSupplyItemRequestDto = { quantity: 2 };

    jest.spyOn(cleanController, 'addPartSupply').mockResolvedValue(dataResponse);
    jest.spyOn(cleanController, 'updatePartSupply').mockResolvedValue(dataResponse);
    jest.spyOn(cleanController, 'removePartSupply').mockResolvedValue(undefined);

    await expect(httpController.addPartSupply(quote.id, addRequest)).resolves.toBe(dataResponse);
    await expect(httpController.updatePartSupply(quote.id, 'part-id', updateRequest)).resolves.toBe(
      dataResponse,
    );
    await expect(httpController.removePartSupply(quote.id, 'part-id')).resolves.toBeUndefined();

    expect(cleanController.addPartSupply).toHaveBeenCalledWith(quote.id, addRequest);
    expect(cleanController.updatePartSupply).toHaveBeenCalledWith(
      quote.id,
      'part-id',
      updateRequest,
    );
    expect(cleanController.removePartSupply).toHaveBeenCalledWith(quote.id, 'part-id');
  });

  it('should delegate the submission with the id of the authenticated sender', async () => {
    const principal = { sub: 'sender-id', email: 'admin@oficina.com', role: UserRole.ADMIN };
    jest.spyOn(cleanController, 'submit').mockResolvedValue(dataResponse);

    await expect(httpController.submit(quote.id, principal)).resolves.toBe(dataResponse);
    expect(cleanController.submit).toHaveBeenCalledWith(quote.id, 'sender-id');
  });
});
