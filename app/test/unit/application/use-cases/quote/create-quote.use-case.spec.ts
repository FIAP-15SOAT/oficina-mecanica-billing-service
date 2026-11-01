import { CreateQuoteUseCase } from '@application/use-cases/quote/create-quote.use-case';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { QuoteItemValidator } from '@application/services/quote-item-validator';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import {
  createMockInventoryCatalogGateway,
  createMockInventoryPartSupplyGatewayResponse,
  createMockInventoryServiceGatewayResponse,
} from '../../../../helpers/inventory-catalog-gateway-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';
import {
  createMockWorkOrderGateway,
  createMockWorkOrderGatewayResponse,
} from '../../../../helpers/work-order-gateway-mock.factory';

describe('CreateQuoteUseCase', () => {
  const workOrderId = '6f1c2b9e-4d3a-4e8b-9c7d-2a1b3c4d5e6f';
  let useCase: CreateQuoteUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let workOrderGateway: jest.Mocked<IWorkOrderGateway>;
  let inventoryCatalogGateway: jest.Mocked<IInventoryCatalogGateway>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();
    quoteRepository.findByWorkOrderId.mockResolvedValue([]);
    quoteRepository.create.mockImplementation((quote) => Promise.resolve(quote));
    workOrderGateway = createMockWorkOrderGateway();
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ id: workOrderId }),
    );
    inventoryCatalogGateway = createMockInventoryCatalogGateway();
    cache = createMockCache();
    useCase = new CreateQuoteUseCase(
      quoteRepository,
      new QuoteWorkOrderPolicy(workOrderGateway),
      new QuoteItemValidator(inventoryCatalogGateway),
      cache,
    );
  });

  it('should create an empty quote for a work order in diagnosis', async () => {
    const result = await useCase.execute({ workOrderId });

    expect(result.workOrderId).toBe(workOrderId);
    expect(result.status).toBe(QuoteStatus.PENDING);
    expect(quoteRepository.create).toHaveBeenCalledTimes(1);
  });

  it('should price the items with the inventory prices', async () => {
    const service = createMockInventoryServiceGatewayResponse({ basePrice: 100 });
    const partSupply = createMockInventoryPartSupplyGatewayResponse({ salePrice: 30 });

    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

    const result = await useCase.execute({
      workOrderId,
      services: [{ serviceId: service.id, quantity: 2 }],
      partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
    });

    expect(result.servicesAmount).toBe(200);
    expect(result.partsAmount).toBe(30);
    expect(result.totalAmount).toBe(230);
  });

  it('should reject parts without a service', async () => {
    await expect(
      useCase.execute({ workOrderId, partsSupplies: [{ partSupplyId: 'part-id', quantity: 1 }] }),
    ).rejects.toThrow(BusinessRuleViolationException);
  });

  it('should throw not found for a service the inventory does not have', async () => {
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({ workOrderId, services: [{ serviceId: 'unknown-id', quantity: 1 }] }),
    ).rejects.toThrow(ResourceNotFoundException);

    expect(quoteRepository.create).not.toHaveBeenCalled();
  });

  it('should refuse a work order outside the quotable statuses', async () => {
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.RECEIVED }),
    );

    await expect(useCase.execute({ workOrderId })).rejects.toThrow(ResourceConflictException);
    expect(quoteRepository.create).not.toHaveBeenCalled();
  });

  it('should refuse a work order that already has an approved quote', async () => {
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      createMockQuote({ workOrderId, status: QuoteStatus.APPROVED }),
    ]);

    await expect(useCase.execute({ workOrderId })).rejects.toThrow(
      new ResourceConflictException('A ordem de serviço já tem um orçamento aprovado'),
    );

    expect(quoteRepository.create).not.toHaveBeenCalled();
  });

  it('should delete the work order list key after the quote is created', async () => {
    await useCase.execute({ workOrderId });

    expect(cache.delete).toHaveBeenCalledWith([`billing:work-order-quotes:${workOrderId}`]);
  });

  it('should not touch the cache when the creation fails', async () => {
    quoteRepository.create.mockRejectedValue(new Error('database down'));

    await expect(useCase.execute({ workOrderId })).rejects.toThrow('database down');
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
