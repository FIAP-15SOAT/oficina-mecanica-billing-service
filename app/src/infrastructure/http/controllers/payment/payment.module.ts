import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { IMercadoPagoOrderGateway } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IMetrics } from '@application/ports/output/services/metrics.service.interface';
import { PaymentCloser } from '@application/services/payment-closer';
import { WorkOrderBalanceReader } from '@application/services/work-order-balance-reader';
import { CreatePaymentUseCase } from '@application/use-cases/payment/create-payment.use-case';
import { FindAllPaymentsPaginatedUseCase } from '@application/use-cases/payment/find-all-payments-paginated.use-case';
import { FindPaymentByIdUseCase } from '@application/use-cases/payment/find-payment-by-id.use-case';
import { SyncPaymentStatusUseCase } from '@application/use-cases/payment/sync-payment-status.use-case';

import { PaymentController as PaymentCleanController } from '@interface-adapters/payment/payment.controller';
import { PaymentWebhookController as PaymentWebhookCleanController } from '@interface-adapters/payment/payment-webhook.controller';

import { PaymentController } from './payment.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  controllers: [PaymentController, PaymentWebhookController],
  providers: [
    {
      provide: PaymentCleanController,
      useFactory: (
        unitOfWork: IUnitOfWork,
        quoteRepository: IQuoteRepository,
        paymentRepository: IPaymentRepository,
        workOrderGateway: IWorkOrderGateway,
        mercadoPagoOrderGateway: IMercadoPagoOrderGateway,
        logger: ILogger,
        metrics: IMetrics,
        configService: ConfigService,
      ) =>
        new PaymentCleanController(
          // The use case validates the ISO 8601 duration, so an invalid value fails the boot.
          new CreatePaymentUseCase(
            unitOfWork,
            workOrderGateway,
            mercadoPagoOrderGateway,
            new WorkOrderBalanceReader(quoteRepository, paymentRepository),
            logger,
            metrics,
            configService.getOrThrow<string>('MERCADOPAGO_ORDER_EXPIRATION'),
          ),
          new FindPaymentByIdUseCase(paymentRepository),
          new FindAllPaymentsPaginatedUseCase(paymentRepository),
        ),
      inject: [
        'IUnitOfWork',
        'IQuoteRepository',
        'IPaymentRepository',
        'IWorkOrderGateway',
        'IMercadoPagoOrderGateway',
        'ILogger',
        'IMetrics',
        ConfigService,
      ],
    },
    {
      provide: PaymentWebhookCleanController,
      useFactory: (
        unitOfWork: IUnitOfWork,
        paymentRepository: IPaymentRepository,
        mercadoPagoOrderGateway: IMercadoPagoOrderGateway,
        logger: ILogger,
        metrics: IMetrics,
      ) =>
        new PaymentWebhookCleanController(
          new SyncPaymentStatusUseCase(
            paymentRepository,
            mercadoPagoOrderGateway,
            new PaymentCloser(unitOfWork, logger, metrics),
            logger,
          ),
        ),
      inject: [
        'IUnitOfWork',
        'IPaymentRepository',
        'IMercadoPagoOrderGateway',
        'ILogger',
        'IMetrics',
      ],
    },
  ],
})
export class PaymentModule {}
