import { AddQuotePartSupplyUseCase } from '@application/use-cases/quote/add-quote-part-supply.use-case';
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
  createMockInventoryPartSupplyGatewayResponse,
} from '../../../../helpers/inventory-catalog-gateway-mock.factory';
import { createMockQuote, createMockQuotePartSupply } from '../../../../helpers/quote-mock.factory';
import {
  createMockQuoteRepository,
  createMockUnitOfWorkWithRepos,
} from '../../../../helpers/unit-of-work-mock.factory';

describe('AddQuotePartSupplyUseCase', () => {
  let useCase: AddQuotePartSupplyUseCase;
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

    useCase = new AddQuotePartSupplyUseCase(
      quoteRepository,
      unitOfWork,
      inventoryCatalogGateway,
      cache,
    );
  });

  it('should add the part supply with the inventory price and recalculate the totals', async () => {
    const quote = createMockQuote({ status: QuoteStatus.PENDING });
    const partSupply = createMockInventoryPartSupplyGatewayResponse({ salePrice: 150 });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

    const result = await useCase.execute({
      quoteId: quote.id,
      partSupplyId: partSupply.id,
      quantity: 1,
    });

    expect(transactionQuoteRepository.addPartSupplyItem).toHaveBeenCalledTimes(1);
    expect(transactionQuoteRepository.update).toHaveBeenCalledWith(quote);
    expect(result.partsAmount).toBe(150);
  });

  it('should throw not found for an unknown quote before reading the inventory', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(null);

    await expect(
      useCase.execute({ quoteId: 'unknown-id', partSupplyId: 'any', quantity: 1 }),
    ).rejects.toThrow(new ResourceNotFoundException('Orçamento', 'unknown-id'));

    expect(inventoryCatalogGateway.findPartsSuppliesByIds).not.toHaveBeenCalled();
  });

  it('should throw not found for a part supply the inventory does not have', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({ quoteId: 'quote-id', partSupplyId: 'unknown-id', quantity: 1 }),
    ).rejects.toThrow(new ResourceNotFoundException('Peça/Insumo', 'unknown-id'));

    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
  });

  it('should refuse a quote that is not pending', async () => {
    const partSupply = createMockInventoryPartSupplyGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({ status: QuoteStatus.SENT }),
    );
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

    await expect(
      useCase.execute({ quoteId: 'quote-id', partSupplyId: partSupply.id, quantity: 1 }),
    ).rejects.toThrow(BusinessRuleViolationException);

    expect(transactionQuoteRepository.addPartSupplyItem).not.toHaveBeenCalled();
  });

  it('should refuse a part supply already in the quote', async () => {
    const partSupply = createMockInventoryPartSupplyGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({
        partsSupplies: [createMockQuotePartSupply({ partSupplyId: partSupply.id })],
      }),
    );
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

    await expect(
      useCase.execute({ quoteId: 'quote-id', partSupplyId: partSupply.id, quantity: 1 }),
    ).rejects.toThrow(BusinessRuleViolationException);

    expect(transactionQuoteRepository.addPartSupplyItem).not.toHaveBeenCalled();
  });

  it('should delete the quote and work order list keys after the commit', async () => {
    const quote = createMockQuote();
    const partSupply = createMockInventoryPartSupplyGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

    await useCase.execute({ quoteId: quote.id, partSupplyId: partSupply.id, quantity: 1 });

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);
  });

  it('should not touch the cache when the transaction fails', async () => {
    const partSupply = createMockInventoryPartSupplyGatewayResponse();

    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);
    transactionQuoteRepository.update.mockRejectedValue(new Error('version conflict'));

    await expect(
      useCase.execute({ quoteId: 'quote-id', partSupplyId: partSupply.id, quantity: 1 }),
    ).rejects.toThrow('version conflict');

    expect(cache.delete).not.toHaveBeenCalled();
  });
});
