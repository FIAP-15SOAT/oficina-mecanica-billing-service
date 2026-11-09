import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { IMercadoPagoOrderGateway } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IMetrics } from '@application/ports/output/services/metrics.service.interface';
import { WorkOrderBalanceReader } from '@application/services/work-order-balance-reader';
import { CreatePaymentUseCase } from '@application/use-cases/payment/create-payment.use-case';

import { PaymentController as PaymentCleanController } from '@interface-adapters/payment/payment.controller';

import { PaymentController } from './payment.controller';

@Module({
  controllers: [PaymentController],
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
  ],
})
export class PaymentModule {}
