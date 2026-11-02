import { Quote } from '@domain/entities/quote.entity';

import {
  InventoryPartSupplyGatewayResponse,
  InventoryServiceGatewayResponse,
} from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.response';

export interface QuoteItemsCatalog {
  services: InventoryServiceGatewayResponse[];
  partsSupplies: InventoryPartSupplyGatewayResponse[];
}

export interface IFindQuoteItemsCatalogUseCase {
  execute(quote: Quote): Promise<QuoteItemsCatalog>;
}
