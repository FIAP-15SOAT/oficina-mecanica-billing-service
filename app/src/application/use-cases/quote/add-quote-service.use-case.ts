import { Quote } from '@domain/entities/quote.entity';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { billingCacheKeys } from '@application/keys/billing-cache-keys';
import { IAddQuoteServiceUseCase } from '@application/ports/input/quote/add-quote-service.use-case.interface';
import { AddQuoteServiceDto } from '@application/ports/input/quote/dto/add-quote-service.dto';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { InventoryServiceGatewayResponse } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.response';
import { ICache } from '@application/ports/output/services/cache.service.interface';

export class AddQuoteServiceUseCase implements IAddQuoteServiceUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly inventoryCatalogGateway: IInventoryCatalogGateway,
    private readonly cache: ICache,
  ) {}

  async execute(dto: AddQuoteServiceDto): Promise<Quote> {
    const quote = await this.quoteRepository.findByIdWithDetails(dto.quoteId);

    if (!quote) {
      throw new ResourceNotFoundException('Orçamento', dto.quoteId);
    }

    const service = await this.findService(dto.serviceId);

    const item = quote.addService({
      serviceId: dto.serviceId,
      unitPrice: service.basePrice,
      quantity: dto.quantity,
    });

    const updated = await this.unitOfWork.executeTransaction(async (repos) => {
      await repos.quote.addServiceItem(item);
      return repos.quote.update(quote);
    });

    await this.cache.delete([
      billingCacheKeys.quote(quote.id),
      billingCacheKeys.workOrderQuotes(quote.workOrderId),
    ]);

    return updated;
  }

  private async findService(serviceId: string): Promise<InventoryServiceGatewayResponse> {
    const [service] = await this.inventoryCatalogGateway.findServicesByIds([serviceId]);

    if (!service) {
      throw new ResourceNotFoundException('Serviço', serviceId);
    }

    return service;
  }
}
