import { Module } from '@nestjs/common';

import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { IPaymentProviderGateway } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IMetrics } from '@application/ports/output/services/metrics.service.interface';
import { PaymentCloser } from '@application/services/payment-closer';
import { CancelPaymentUseCase } from '@application/use-cases/payment/cancel-payment.use-case';

import { MessageHandlerRegistry } from '../../message-handler.registry';
import { PaymentMessageHandlers } from './payment-message-handlers';

@Module({
  providers: [
    {
      provide: PaymentMessageHandlers,
      useFactory: (
        registry: MessageHandlerRegistry,
        unitOfWork: IUnitOfWork,
        paymentRepository: IPaymentRepository,
        paymentProviderGateway: IPaymentProviderGateway,
        logger: ILogger,
        metrics: IMetrics,
      ) =>
        new PaymentMessageHandlers(
          registry,
          new CancelPaymentUseCase(
            paymentRepository,
            paymentProviderGateway,
            new PaymentCloser(unitOfWork, logger, metrics),
            logger,
          ),
        ),
      inject: [
        MessageHandlerRegistry,
        'IUnitOfWork',
        'IPaymentRepository',
        'IPaymentProviderGateway',
        'ILogger',
        'IMetrics',
      ],
    },
  ],
})
export class PaymentMessagingModule {}
