import { QuoteItemValidator } from '@application/services/quote-item-validator';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';

import {
  createMockInventoryCatalogGateway,
  createMockInventoryPartSupplyGatewayResponse,
  createMockInventoryServiceGatewayResponse,
} from '../../../helpers/inventory-catalog-gateway-mock.factory';

describe('QuoteItemValidator', () => {
  const inventoryCatalogGateway = createMockInventoryCatalogGateway();
  const validator = new QuoteItemValidator(inventoryCatalogGateway);

  beforeEach(() => jest.resetAllMocks());

  describe('resolveServiceItems()', () => {
    it('returns empty array when inputs are empty', async () => {
      await expect(validator.resolveServiceItems([])).resolves.toEqual([]);
      expect(inventoryCatalogGateway.findServicesByIds).not.toHaveBeenCalled();
    });

    it('prices each service with the inventory base price', async () => {
      const service = createMockInventoryServiceGatewayResponse({ basePrice: 100 });

      inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

      await expect(
        validator.resolveServiceItems([{ serviceId: service.id, quantity: 2 }]),
      ).resolves.toEqual([{ serviceId: service.id, unitPrice: 100, quantity: 2 }]);
    });

    it('throws not found for an id absent from the inventory', async () => {
      inventoryCatalogGateway.findServicesByIds.mockResolvedValue([]);

      await expect(
        validator.resolveServiceItems([{ serviceId: 'unknown-service-id', quantity: 1 }]),
      ).rejects.toThrow(new ResourceNotFoundException('Serviço', 'unknown-service-id'));
    });
  });

  describe('resolvePartSupplyItems()', () => {
    it('returns [] when inputs are empty', async () => {
      await expect(validator.resolvePartSupplyItems([])).resolves.toEqual([]);
      expect(inventoryCatalogGateway.findPartsSuppliesByIds).not.toHaveBeenCalled();
    });

    it('prices each part supply with the inventory sale price', async () => {
      const partSupply = createMockInventoryPartSupplyGatewayResponse({ salePrice: 50 });

      inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

      await expect(
        validator.resolvePartSupplyItems([{ partSupplyId: partSupply.id, quantity: 3 }]),
      ).resolves.toEqual([{ partSupplyId: partSupply.id, unitPrice: 50, quantity: 3 }]);
    });

    it('throws not found for an id absent from the inventory', async () => {
      inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([]);

      await expect(
        validator.resolvePartSupplyItems([{ partSupplyId: 'unknown-part-id', quantity: 1 }]),
      ).rejects.toThrow(new ResourceNotFoundException('Peça/Insumo', 'unknown-part-id'));
    });
  });

  describe('validateAndResolve()', () => {
    it('validates then returns the priced services and parts', async () => {
      const service = createMockInventoryServiceGatewayResponse({ basePrice: 100 });
      const partSupply = createMockInventoryPartSupplyGatewayResponse({ salePrice: 50 });

      inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);
      inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

      await expect(
        validator.validateAndResolve(
          [{ serviceId: service.id, quantity: 1 }],
          [{ partSupplyId: partSupply.id, quantity: 2 }],
        ),
      ).resolves.toEqual({
        services: [{ serviceId: service.id, unitPrice: 100, quantity: 1 }],
        partsSupplies: [{ partSupplyId: partSupply.id, unitPrice: 50, quantity: 2 }],
      });
    });

    it('rejects parts without a service before any lookup', async () => {
      await expect(
        validator.validateAndResolve([], [{ partSupplyId: 'part-id', quantity: 1 }]),
      ).rejects.toThrow(BusinessRuleViolationException);

      expect(inventoryCatalogGateway.findServicesByIds).not.toHaveBeenCalled();
      expect(inventoryCatalogGateway.findPartsSuppliesByIds).not.toHaveBeenCalled();
    });

    it('rejects duplicate service ids before any lookup', async () => {
      await expect(
        validator.validateAndResolve(
          [
            { serviceId: 'dup-id', quantity: 1 },
            { serviceId: 'dup-id', quantity: 2 },
          ],
          [],
        ),
      ).rejects.toThrow(BusinessRuleViolationException);

      expect(inventoryCatalogGateway.findServicesByIds).not.toHaveBeenCalled();
    });
  });
});
