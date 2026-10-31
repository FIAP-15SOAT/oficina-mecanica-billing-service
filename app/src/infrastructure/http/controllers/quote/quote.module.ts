import { Module } from '@nestjs/common';

import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { IInventoryCatalogGateway } from '@application/ports/output/gateways/inventory/inventory-catalog-gateway.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { ICache } from '@application/ports/output/services/cache.service.interface';
import { QuoteItemValidator } from '@application/services/quote-item-validator';
import { CreateQuoteUseCase } from '@application/use-cases/quote/create-quote.use-case';
import { FindQuoteByIdUseCase } from '@application/use-cases/quote/find-quote-by-id.use-case';
import { AddQuoteServiceUseCase } from '@application/use-cases/quote/add-quote-service.use-case';
import { RemoveQuoteServiceUseCase } from '@application/use-cases/quote/remove-quote-service.use-case';
import { AddQuotePartSupplyUseCase } from '@application/use-cases/quote/add-quote-part-supply.use-case';
import { RemoveQuotePartSupplyUseCase } from '@application/use-cases/quote/remove-quote-part-supply.use-case';
import { UpdateQuoteServiceQuantityUseCase } from '@application/use-cases/quote/update-quote-service-quantity.use-case';
import { UpdateQuotePartSupplyQuantityUseCase } from '@application/use-cases/quote/update-quote-part-supply-quantity.use-case';
import { FindAllQuotesPaginatedUseCase } from '@application/use-cases/quote/find-all-quotes-paginated.use-case';
import { FindWorkOrderQuotesUseCase } from '@application/use-cases/quote/find-work-order-quotes.use-case';
import { FindWorkOrdersByIdsUseCase } from '@application/use-cases/quote/find-work-orders-by-ids.use-case';
import { FindQuoteItemsCatalogUseCase } from '@application/use-cases/quote/find-quote-items-catalog.use-case';

import { QuoteController as QuoteCleanController } from '@interface-adapters/quote/quote.controller';

import { QuoteController } from './quote.controller';
import { WorkOrderQuoteController } from './work-order-quote.controller';

@Module({
  controllers: [QuoteController, WorkOrderQuoteController],
  providers: [
    {
      provide: QuoteCleanController,
      useFactory: (
        unitOfWork: IUnitOfWork,
        quoteRepository: IQuoteRepository,
        workOrderGateway: IWorkOrderGateway,
        inventoryCatalogGateway: IInventoryCatalogGateway,
        cache: ICache,
      ) => {
        const quoteWorkOrderPolicy = new QuoteWorkOrderPolicy(workOrderGateway);

        return new QuoteCleanController(
          new CreateQuoteUseCase(
            quoteRepository,
            quoteWorkOrderPolicy,
            new QuoteItemValidator(inventoryCatalogGateway),
            cache,
          ),
          new FindQuoteByIdUseCase(quoteRepository, cache),
          new AddQuoteServiceUseCase(quoteRepository, unitOfWork, inventoryCatalogGateway, cache),
          new RemoveQuoteServiceUseCase(unitOfWork, cache),
          new AddQuotePartSupplyUseCase(
            quoteRepository,
            unitOfWork,
            inventoryCatalogGateway,
            cache,
          ),
          new RemoveQuotePartSupplyUseCase(unitOfWork, cache),
          new UpdateQuoteServiceQuantityUseCase(unitOfWork, cache),
          new UpdateQuotePartSupplyQuantityUseCase(unitOfWork, cache),
          new FindAllQuotesPaginatedUseCase(quoteRepository),
          new FindWorkOrderQuotesUseCase(quoteRepository, cache),
          new FindWorkOrdersByIdsUseCase(workOrderGateway),
          new FindQuoteItemsCatalogUseCase(inventoryCatalogGateway),
        );
      },
      inject: [
        'IUnitOfWork',
        'IQuoteRepository',
        'IWorkOrderGateway',
        'IInventoryCatalogGateway',
        'ICache',
      ],
    },
  ],
})
export class QuoteModule {}
