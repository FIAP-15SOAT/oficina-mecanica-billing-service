import { Quote } from '@domain/entities/quote.entity';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { IAddQuotePartSupplyUseCase } from '@application/ports/input/quote/add-quote-part-supply.use-case.interface';
import { AddQuotePartSupplyDto } from '@application/ports/input/quote/dto/add-quote-part-supply.dto';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { InventoryPartSupplyGatewayResponse } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.response';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class AddQuotePartSupplyUseCase implements IAddQuotePartSupplyUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly inventoryCatalogGateway: IInventoryCatalogGateway,
    private readonly cache: ICache,
  ) {}

  async execute(dto: AddQuotePartSupplyDto): Promise<Quote> {
    const quote = await this.quoteRepository.findByIdWithDetails(dto.quoteId);

    if (!quote) {
      throw new ResourceNotFoundException('Orçamento', dto.quoteId);
    }

    const partSupply = await this.findPartSupply(dto.partSupplyId);

    const item = quote.addPartSupply({
      partSupplyId: dto.partSupplyId,
      unitPrice: partSupply.salePrice,
      quantity: dto.quantity,
    });

    const updated = await this.unitOfWork.executeTransaction(async (repos) => {
      await repos.quote.addPartSupplyItem(item);
      return repos.quote.update(quote);
    });

    await this.cache.delete([
      billingCacheKeys.quote(quote.id),
      billingCacheKeys.workOrderQuotes(quote.workOrderId),
    ]);

    return updated;
  }

  private async findPartSupply(partSupplyId: string): Promise<InventoryPartSupplyGatewayResponse> {
    const [partSupply] = await this.inventoryCatalogGateway.findPartsSuppliesByIds([partSupplyId]);

    if (!partSupply) {
      throw new ResourceNotFoundException('Peça/Insumo', partSupplyId);
    }

    return partSupply;
  }
}
