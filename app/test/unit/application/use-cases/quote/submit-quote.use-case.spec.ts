import { randomUUID } from 'node:crypto';

import { SubmitQuoteUseCase } from '@application/use-cases/quote/submit-quote.use-case';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { BusinessRuleViolationException } from '@domain/exceptions/business-rule-violation.exception';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';

import { createMockCache } from '../../../../helpers/cache-mock.factory';
import {
  createMockInventoryCatalogGateway,
  createMockInventoryPartSupplyGatewayResponse,
  createMockInventoryServiceGatewayResponse,
} from '../../../../helpers/inventory-catalog-gateway-mock.factory';
import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { createMockQuote, createMockQuoteService } from '../../../../helpers/quote-mock.factory';
import {
  createMockQuoteRepository,
  createMockUnitOfWorkWithRepos,
} from '../../../../helpers/unit-of-work-mock.factory';
import {
  createMockWorkOrderGateway,
  createMockWorkOrderGatewayResponse,
} from '../../../../helpers/work-order-gateway-mock.factory';

describe('SubmitQuoteUseCase', () => {
  const sentBy = randomUUID();
  let useCase: SubmitQuoteUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let transactionQuoteRepository: jest.Mocked<IQuoteRepository>;
  let outboxRepository: jest.Mocked<IOutboxRepository>;
  let workOrderGateway: jest.Mocked<IWorkOrderGateway>;
  let inventoryCatalogGateway: jest.Mocked<IInventoryCatalogGateway>;
  let logger: jest.Mocked<ILogger>;
  let cache: jest.Mocked<ICache>;

  beforeEach(() => {
    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;
    transactionQuoteRepository = mock.repos.quote as jest.Mocked<IQuoteRepository>;
    transactionQuoteRepository.update.mockImplementation((quote) => Promise.resolve(quote));
    outboxRepository = mock.repos.outbox as jest.Mocked<IOutboxRepository>;
    quoteRepository = createMockQuoteRepository();
    quoteRepository.findByWorkOrderId.mockResolvedValue([]);
    workOrderGateway = createMockWorkOrderGateway();
    workOrderGateway.findById.mockResolvedValue(createMockWorkOrderGatewayResponse());
    inventoryCatalogGateway = createMockInventoryCatalogGateway();
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([]);
    logger = createMockLogger();
    cache = createMockCache();
    useCase = new SubmitQuoteUseCase(
      quoteRepository,
      unitOfWork,
      new QuoteWorkOrderPolicy(workOrderGateway),
      inventoryCatalogGateway,
      logger,
      cache,
    );
  });

  it('should write billing.quote.sent with the item names read in the inventory', async () => {
    const service = createMockInventoryServiceGatewayResponse({ name: 'Troca de óleo' });
    const partSupply = createMockInventoryPartSupplyGatewayResponse({ name: 'Filtro de óleo' });

    const quote = Quote.create({
      workOrderId: randomUUID(),
      services: [{ serviceId: service.id, unitPrice: 120, quantity: 1 }],
      partsSupplies: [{ partSupplyId: partSupply.id, unitPrice: 35.5, quantity: 2 }],
    });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);
    inventoryCatalogGateway.findPartsSuppliesByIds.mockResolvedValue([partSupply]);

    const result = await useCase.execute(quote.id, sentBy);

    expect(result.status).toBe(QuoteStatus.SENT);
    expect(transactionQuoteRepository.update).toHaveBeenCalledWith(quote);

    expect(outboxRepository.add).toHaveBeenCalledWith({
      type: 'billing.quote.sent',
      workOrderId: quote.workOrderId,
      payload: {
        quoteId: quote.id,
        sentBy,
        total: '191.00',
        items: [
          { name: 'Troca de óleo', quantity: 1, unitPrice: '120.00' },
          { name: 'Filtro de óleo', quantity: 2, unitPrice: '35.50' },
        ],
      },
    });
  });

  it('should format money with two decimals', async () => {
    const service = createMockInventoryServiceGatewayResponse();

    const quote = Quote.create({
      workOrderId: randomUUID(),
      services: [{ serviceId: service.id, unitPrice: 0.1, quantity: 3 }],
      partsSupplies: [],
    });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

    await useCase.execute(quote.id, sentBy);

    expect(outboxRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          total: '0.30',
          items: [{ name: service.name, quantity: 3, unitPrice: '0.10' }],
        }),
      }),
    );
  });

  it('should throw not found for an unknown quote', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(null);

    await expect(useCase.execute('unknown-id', sentBy)).rejects.toThrow(
      new ResourceNotFoundException('Orçamento', 'unknown-id'),
    );

    expect(workOrderGateway.findById).not.toHaveBeenCalled();
  });

  it('should refuse with 409 when the work order is RECEIVED and write nothing', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(
      createMockQuote({ services: [createMockQuoteService()] }),
    );
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.RECEIVED }),
    );

    await expect(useCase.execute('quote-id', sentBy)).rejects.toThrow(ResourceConflictException);
    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
  });

  it('should refuse with 409 when the work order already has an APPROVED quote', async () => {
    const quote = createMockQuote({ services: [createMockQuoteService()] });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      quote,
      createMockQuote({ workOrderId: quote.workOrderId, status: QuoteStatus.APPROVED }),
    ]);

    await expect(useCase.execute(quote.id, sentBy)).rejects.toThrow(
      new ResourceConflictException('A ordem de serviço já tem um orçamento aprovado'),
    );

    expect(quoteRepository.findByWorkOrderId).toHaveBeenCalledWith(quote.workOrderId);
    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
  });

  it('should refuse a quote without services before reading the inventory', async () => {
    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote());

    await expect(useCase.execute('quote-id', sentBy)).rejects.toThrow(
      BusinessRuleViolationException,
    );

    expect(inventoryCatalogGateway.findServicesByIds).not.toHaveBeenCalled();
  });

  it('should not submit when a service is no longer in the inventory', async () => {
    const item = createMockQuoteService();

    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote({ services: [item] }));
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([]);

    await expect(useCase.execute('quote-id', sentBy)).rejects.toThrow(
      new ResourceNotFoundException('Serviço', item.serviceId),
    );

    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
  });

  it('should not submit when a part supply is no longer in the inventory', async () => {
    const service = createMockInventoryServiceGatewayResponse();
    const partSupplyId = randomUUID();

    const quote = Quote.create({
      workOrderId: randomUUID(),
      services: [{ serviceId: service.id, unitPrice: 100, quantity: 1 }],
      partsSupplies: [{ partSupplyId, unitPrice: 10, quantity: 1 }],
    });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([service]);

    await expect(useCase.execute(quote.id, sentBy)).rejects.toThrow(
      new ResourceNotFoundException('Peça/Insumo', partSupplyId),
    );

    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
  });

  it('should refuse with 409 when the quote changed after it was read', async () => {
    const item = createMockQuoteService();

    const conflict = new ConcurrencyException(
      'Orçamento foi modificado por outra operação. Tente novamente',
    );

    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote({ services: [item] }));
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([
      createMockInventoryServiceGatewayResponse({ id: item.serviceId }),
    ]);
    transactionQuoteRepository.update.mockRejectedValue(conflict);

    await expect(useCase.execute('quote-id', sentBy)).rejects.toThrow(conflict);
    expect(outboxRepository.add).not.toHaveBeenCalled();
  });

  it('should delete the quote and work order list keys and log after the commit', async () => {
    const item = createMockQuoteService();
    const quote = createMockQuote({ services: [item] });

    quoteRepository.findByIdWithDetails.mockResolvedValue(quote);
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([
      createMockInventoryServiceGatewayResponse({ id: item.serviceId }),
    ]);

    await useCase.execute(quote.id, sentBy);

    expect(cache.delete).toHaveBeenCalledWith([
      `billing:quote:${quote.id}`,
      `billing:work-order-quotes:${quote.workOrderId}`,
    ]);

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.QUOTE_SUBMITTED, {
      quoteId: quote.id,
      workOrderId: quote.workOrderId,
    });
  });

  it('should not touch the cache when the transaction fails', async () => {
    const item = createMockQuoteService();

    quoteRepository.findByIdWithDetails.mockResolvedValue(createMockQuote({ services: [item] }));
    inventoryCatalogGateway.findServicesByIds.mockResolvedValue([
      createMockInventoryServiceGatewayResponse({ id: item.serviceId }),
    ]);
    outboxRepository.add.mockRejectedValue(new Error('outbox down'));

    await expect(useCase.execute('quote-id', sentBy)).rejects.toThrow('outbox down');
    expect(cache.delete).not.toHaveBeenCalled();
    expect(logger.event).not.toHaveBeenCalled();
  });
});
