import { CreateInitialQuoteUseCase } from '@application/use-cases/quote/create-initial-quote.use-case';
import { QuoteItemValidator } from '@application/services/quote-item-validator';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import {
  createMockInventoryCatalogGateway,
  createMockInventoryServiceGatewayResponse,
} from '../../../../helpers/inventory-catalog-gateway-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';

describe('CreateInitialQuoteUseCase', () => {
  const workOrderId = '6f1c2b9e-4d3a-4e8b-9c7d-2a1b3c4d5e6f';
  let useCase: CreateInitialQuoteUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let inventoryCatalogGateway: jest.Mocked<IInventoryCatalogGateway>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();
    quoteRepository.findByWorkOrderId.mockResolvedValue([]);
    quoteRepository.create.mockImplementation((quote) => Promise.resolve(quote));

    inventoryCatalogGateway = createMockInventoryCatalogGateway();

    cache = createMockCache();

    useCase = new CreateInitialQuoteUseCase(
      quoteRepository,
      new QuoteItemValidator(inventoryCatalogGateway),
      cache,
    );
  });

  it('should create the initial quote priced by the inventory', async () => {
    const service = createMockInventoryServiceGatewayResponse({ basePrice: 120 });

    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

    const result = await useCase.execute({
      workOrderId,
      services: [{ serviceId: service.id, quantity: 2 }],
    });

    expect(result.workOrderId).toBe(workOrderId);
    expect(result.status).toBe(QuoteStatus.PENDING);
    expect(result.totalAmount).toBe(240);
    expect(quoteRepository.create).toHaveBeenCalledTimes(1);
  });

  it('should return the oldest quote of the work order instead of creating another', async () => {
    const newest = createMockQuote({ workOrderId });
    const oldest = createMockQuote({ workOrderId });

    quoteRepository.findByWorkOrderId.mockResolvedValue([newest, oldest]);

    const result = await useCase.execute({ workOrderId });

    expect(result).toBe(oldest);
    expect(quoteRepository.create).not.toHaveBeenCalled();
  });

  it('should pass through not found for a service the inventory does not have', async () => {
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({ workOrderId, services: [{ serviceId: 'unknown-id', quantity: 1 }] }),
    ).rejects.toThrow(ResourceNotFoundException);

    expect(quoteRepository.create).not.toHaveBeenCalled();
  });

  it('should delete the work order list key after the quote is created', async () => {
    await useCase.execute({ workOrderId });

    expect(cache.delete).toHaveBeenCalledWith([`billing:work-order-quotes:${workOrderId}`]);
  });

  it('should not touch the cache when the existing quote is returned', async () => {
    quoteRepository.findByWorkOrderId.mockResolvedValue([createMockQuote({ workOrderId })]);

    await useCase.execute({ workOrderId });

    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('should not touch the cache when the creation fails', async () => {
    quoteRepository.create.mockRejectedValue(new Error('database down'));

    await expect(useCase.execute({ workOrderId })).rejects.toThrow('database down');
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
