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

describe('FindQuoteItemsCatalogUseCase', () => {
  const inventoryCatalogGateway = createMockInventoryCatalogGateway();
  const useCase = new FindQuoteItemsCatalogUseCase(inventoryCatalogGateway);

  beforeEach(() => jest.resetAllMocks());

  it('reads services and parts in parallel', () => {
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

  it('returns only the items the inventory has', async () => {
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
