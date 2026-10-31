import { AddQuoteServiceUseCase } from '@application/use-cases/quote/add-quote-service.use-case';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import {
  createMockInventoryCatalogGateway,
  createMockInventoryServiceGatewayResponse,
} from '../../../../helpers/inventory-catalog-gateway-mock.factory';
import { createMockQuote, createMockQuoteService } from '../../../../helpers/quote-mock.factory';
import {
  createMockQuoteRepository,
  createMockUnitOfWorkWithRepos,
} from '../../../../helpers/unit-of-work-mock.factory';

describe('AddQuoteServiceUseCase', () => {
  let useCase: AddQuoteServiceUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let transactionQuoteRepository: jest.Mocked<IQuoteRepository>;
  let inventoryCatalogGateway: jest.Mocked<IInventoryCatalogGateway>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;
    transactionQuoteRepository = mock.repos.quote as jest.Mocked<IQuoteRepository>;
    transactionQuoteRepository.update.mockImplementation((quote) => Promise.resolve(quote));
    quoteRepository = createMockQuoteRepository();
    inventoryCatalogGateway = createMockInventoryCatalogGateway();
    cache = createMockCache();
    useCase = new AddQuoteServiceUseCase(
      quoteRepository,
      unitOfWork,
      inventoryCatalogGateway,
      cache,
    );
  });

  it('should add the service with the inventory price and recalculate the totals', async () => {
    const quote = createMockQuote({ status: QuoteStatus.PENDING });
    const service = createMockInventoryServiceGatewayResponse({ basePrice: 150 });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

    const result = await useCase.execute({ quoteId: quote.id, serviceId: service.id, quantity: 1 });

    expect(transactionQuoteRepository.addServiceItem).toHaveBeenCalledTimes(1);
    expect(transactionQuoteRepository.update).toHaveBeenCalledWith(quote);
    expect(result.servicesAmount).toBe(150);
  });

  it('should throw not found for an unknown quote before reading the inventory', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(null);

    await expect(
      useCase.execute({ quoteId: 'unknown-id', serviceId: 'any', quantity: 1 }),
    ).rejects.toThrow(new ResourceNotFoundException('Orçamento', 'unknown-id'));
    expect(inventoryCatalogGateway.findServicesByIds).not.toHaveBeenCalled();
  });

  it('should throw not found for a service the inventory does not have', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({ quoteId: 'quote-id', serviceId: 'unknown-id', quantity: 1 }),
    ).rejects.toThrow(new ResourceNotFoundException('Serviço', 'unknown-id'));
    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
  });

  it('should refuse a quote that is not pending', async () => {
    const service = createMockInventoryServiceGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({ status: QuoteStatus.SENT }),
    );
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

    await expect(
      useCase.execute({ quoteId: 'quote-id', serviceId: service.id, quantity: 1 }),
    ).rejects.toThrow(BusinessRuleViolationException);
    expect(transactionQuoteRepository.addServiceItem).not.toHaveBeenCalled();
  });

  it('should refuse a service already in the quote', async () => {
    const service = createMockInventoryServiceGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({ services: [createMockQuoteService({ serviceId: service.id })] }),
    );
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

    await expect(
      useCase.execute({ quoteId: 'quote-id', serviceId: service.id, quantity: 1 }),
    ).rejects.toThrow(BusinessRuleViolationException);
    expect(transactionQuoteRepository.addServiceItem).not.toHaveBeenCalled();
  });

  it('should delete the quote and work order list keys after the commit', async () => {
    const quote = createMockQuote();
    const service = createMockInventoryServiceGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

    await useCase.execute({ quoteId: quote.id, serviceId: service.id, quantity: 1 });

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);
  });

  it('should not touch the cache when the transaction fails', async () => {
    const service = createMockInventoryServiceGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);
    transactionQuoteRepository.update.mockRejectedValue(new Error('version conflict'));

    await expect(
      useCase.execute({ quoteId: 'quote-id', serviceId: service.id, quantity: 1 }),
    ).rejects.toThrow('version conflict');
    expect(cache.delete).not.toHaveBeenCalled();
  });
});
