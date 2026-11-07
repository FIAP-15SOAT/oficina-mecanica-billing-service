import {
  InventoryPartSupplyGatewayResponse,
  InventoryServiceGatewayResponse,
} from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.response';

export interface QuoteItemsCatalog {
  services: InventoryServiceGatewayResponse[];
  partsSupplies: InventoryPartSupplyGatewayResponse[];
}
