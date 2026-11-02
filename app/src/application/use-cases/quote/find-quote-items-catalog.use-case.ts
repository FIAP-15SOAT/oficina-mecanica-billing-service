import { Quote } from '@domain/entities/quote.entity';

import {
  IFindQuoteItemsCatalogUseCase,
  QuoteItemsCatalog,
} from '@application/ports/input/quote/find-quote-items-catalog.use-case.interface';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';

export class FindQuoteItemsCatalogUseCase implements IFindQuoteItemsCatalogUseCase {
  constructor(private readonly inventoryCatalogGateway: IInventoryCatalogGateway) {}

  async execute(quote: Quote): Promise<QuoteItemsCatalog> {
    const [services, partsSupplies] = await Promise.all([
      this.inventoryCatalogGateway.findServicesByIds(quote.services.map((item) => item.serviceId)),
      this.inventoryCatalogGateway.findPartsSuppliesByIds(
        quote.partsSupplies.map((item) => item.partSupplyId),
      ),
    ]);

    return { services, partsSupplies };
  }
}
