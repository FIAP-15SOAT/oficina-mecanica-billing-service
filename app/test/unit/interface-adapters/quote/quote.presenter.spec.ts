import { QuotePresenter } from '@interface-adapters/quote/quote.presenter';

import {
  createMockInventoryPartSupplyGatewayResponse,
  createMockInventoryServiceGatewayResponse,
} from '../../../helpers/inventory-catalog-gateway-mock.factory';
import {
  createMockQuote,
  createMockQuotePartSupply,
  createMockQuoteService,
} from '../../../helpers/quote-mock.factory';
import {
  createMockWorkOrderGatewayResponse,
  readInternalWorkOrderFixture,
} from '../../../helpers/work-order-gateway-mock.factory';

describe('QuotePresenter', () => {
  it('should embed the work order summary read from the work order service', () => {
    const owner = readInternalWorkOrderFixture().data;
    const quote = createMockQuote({ workOrderId: owner.id, totalAmount: 200 });

    const { data } = QuotePresenter.toDataResponse(quote, owner);
    const { services, partSupplies, ...summary } = owner as typeof owner & {
      services: unknown;
      partSupplies: unknown;
    };

    expect(services).toBeDefined();
    expect(partSupplies).toBeDefined();
    expect(data.workOrder).toEqual(summary);
    expect(data).toMatchObject({ id: quote.id, status: quote.status, totalAmount: 200 });
    expect('workOrderId' in data).toBe(false);
  });

  it('should keep the assigned user of the work order', () => {
    const assignedUser = { id: 'user-id', name: 'Carlos', email: 'carlos@x.com', role: 'MECHANIC' };
    const workOrder = createMockWorkOrderGatewayResponse({ assignedUser });

    const { data } = QuotePresenter.toDataResponse(
      createMockQuote({ workOrderId: workOrder.id }),
      workOrder,
    );

    expect(data.workOrder.assignedUser).toEqual(assignedUser);
  });

  it('should show the display fields the inventory has for each item', () => {
    const service = createMockInventoryServiceGatewayResponse();
    const partSupply = createMockInventoryPartSupplyGatewayResponse();
    const workOrder = createMockWorkOrderGatewayResponse();
    const quote = createMockQuote({
      workOrderId: workOrder.id,
      services: [createMockQuoteService({ serviceId: service.id })],
      partsSupplies: [createMockQuotePartSupply({ partSupplyId: partSupply.id })],
    });

    const { data } = QuotePresenter.toWithItemsResponse(quote, workOrder, {
      services: [service],
      partsSupplies: [partSupply],
    });

    expect(data.services[0]).toMatchObject({
      id: service.id,
      name: service.name,
      description: service.description,
    });
    expect(data.partsSupplies[0]).toMatchObject({
      id: partSupply.id,
      name: partSupply.name,
      description: partSupply.description,
      sku: partSupply.sku,
      partNumber: partSupply.partNumber,
      category: partSupply.category,
      unit: partSupply.unit,
    });
  });

  it('should show null display fields for an item the inventory does not have', () => {
    const workOrder = createMockWorkOrderGatewayResponse();
    const serviceItem = createMockQuoteService();
    const partSupplyItem = createMockQuotePartSupply();
    const quote = createMockQuote({
      workOrderId: workOrder.id,
      services: [serviceItem],
      partsSupplies: [partSupplyItem],
    });

    const { data } = QuotePresenter.toWithItemsResponse(quote, workOrder, {
      services: [],
      partsSupplies: [],
    });

    expect(data.services).toEqual([
      {
        id: serviceItem.serviceId,
        name: null,
        description: null,
        quantity: serviceItem.quantity,
        unitPrice: serviceItem.unitPrice,
        totalPrice: serviceItem.totalPrice,
        createdAt: serviceItem.createdAt,
        updatedAt: serviceItem.updatedAt,
      },
    ]);
    expect(data.partsSupplies).toEqual([
      {
        id: partSupplyItem.partSupplyId,
        name: null,
        description: null,
        sku: null,
        partNumber: null,
        category: null,
        unit: null,
        quantity: partSupplyItem.quantity,
        unitPrice: partSupplyItem.unitPrice,
        totalPrice: partSupplyItem.totalPrice,
        createdAt: partSupplyItem.createdAt,
        updatedAt: partSupplyItem.updatedAt,
      },
    ]);
  });

  it('should keep the frozen unit price when the catalog price changed', () => {
    const service = createMockInventoryServiceGatewayResponse({ basePrice: 999 });
    const partSupply = createMockInventoryPartSupplyGatewayResponse({ salePrice: 999 });
    const workOrder = createMockWorkOrderGatewayResponse();
    const quote = createMockQuote({
      workOrderId: workOrder.id,
      services: [
        createMockQuoteService({ serviceId: service.id, unitPrice: 100, totalPrice: 100 }),
      ],
      partsSupplies: [
        createMockQuotePartSupply({
          partSupplyId: partSupply.id,
          quantity: 2,
          unitPrice: 50,
          totalPrice: 100,
        }),
      ],
    });

    const { data } = QuotePresenter.toWithItemsResponse(quote, workOrder, {
      services: [service],
      partsSupplies: [partSupply],
    });

    expect(data.services[0]).toMatchObject({ unitPrice: 100, totalPrice: 100 });
    expect(data.partsSupplies[0]).toMatchObject({ unitPrice: 50, totalPrice: 100 });
  });

  it('should pair each quote of a list with its own work order', () => {
    const first = createMockWorkOrderGatewayResponse();
    const second = createMockWorkOrderGatewayResponse();
    const quotes = [
      createMockQuote({ workOrderId: second.id }),
      createMockQuote({ workOrderId: first.id }),
    ];

    const { data } = QuotePresenter.toListResponse(quotes, [first, second]);

    expect(data.map((quote) => quote.workOrder.id)).toEqual([second.id, first.id]);
  });

  it('should keep the pagination metadata of a page', () => {
    const workOrder = createMockWorkOrderGatewayResponse();
    const pagination = { totalRecords: 1, totalPages: 1, page: 1, limit: 10 };

    const response = QuotePresenter.toPaginatedResponse(
      { items: [createMockQuote({ workOrderId: workOrder.id })], pagination },
      [workOrder],
    );

    expect(response.pagination).toEqual(pagination);
    expect(response.data[0].workOrder.id).toBe(workOrder.id);
  });
});
