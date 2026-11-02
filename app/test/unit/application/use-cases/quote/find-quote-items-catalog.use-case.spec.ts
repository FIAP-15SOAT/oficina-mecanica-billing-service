import { FindQuoteItemsCatalogUseCase } from '@application/use-cases/quote/find-quote-items-catalog.use-case';

import {
  createMockInventoryCatalogGateway,
  createMockInventoryPartSupplyGatewayResponse,
  createMockInventoryServiceGatewayResponse,
} from '../../../../helpers/inventory-catalog-gateway-mock.factory';
import {
  createMockQuote,
  createMockQuotePartSupply,
  createMockQuoteService,
} from '../../../../helpers/quote-mock.factory';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';

describe('FindQuoteItemsCatalogUseCase', () => {
  let useCase: FindQuoteItemsCatalogUseCase;
  let inventoryCatalogGateway: jest.Mocked<IInventoryCatalogGateway>;

  beforeEach(() => {
    inventoryCatalogGateway = createMockInventoryCatalogGateway();

    useCase = new FindQuoteItemsCatalogUseCase(inventoryCatalogGateway);
  });

  it('should read services and parts in parallel', () => {
    const service = createMockInventoryServiceGatewayResponse();
    const partSupply = createMockInventoryPartSupplyGatewayResponse();

    const quote = createMockQuote({
      services: [createMockQuoteService({ serviceId: service.id })],
      partsSupplies: [createMockQuotePartSupply({ partSupplyId: partSupply.id })],
    });

    inventoryCatalogGateway.findServicesByIds.mockReturnValue(new Promise(() => undefined));
    inventoryCatalogGateway.findPartsSuppliesByIds.mockReturnValue(new Promise(() => undefined));

    void useCase.execute(quote);

    expect(inventoryCatalogGateway.findServicesByIds).toHaveBeenCalledWith([service.id]);
    expect(inventoryCatalogGateway.findPartsSuppliesByIds).toHaveBeenCalledWith([partSupply.id]);
  });

  it('should return only the items the inventory has', async () => {
    const service = createMockInventoryServiceGatewayResponse();
    const partSupply = createMockInventoryPartSupplyGatewayResponse();

    const quote = createMockQuote({
      services: [
        createMockQuoteService({ serviceId: service.id }),
        createMockQuoteService({ serviceId: 'missing-service-id' }),
      ],
      partsSupplies: [
        createMockQuotePartSupply({ partSupplyId: partSupply.id }),
        createMockQuotePartSupply({ partSupplyId: 'missing-part-id' }),
      ],
    });

    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

    await expect(useCase.execute(quote)).resolves.toEqual({
      services: [service],
      partsSupplies: [partSupply],
    });
  });
});
