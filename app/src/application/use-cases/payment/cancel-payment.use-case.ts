import { Payment } from '@domain/entities/payment.entity';
import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { CheckoutStatusMapper } from '@application/mappers/checkout-status.mapper';
import { ICancelPaymentUseCase } from '@application/ports/input/payment/cancel-payment.use-case.interface';
import { IPaymentProviderGateway } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.interface';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { PaymentCloser } from '@application/services/payment-closer';

export class CancelPaymentUseCase implements ICancelPaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly paymentProviderGateway: IPaymentProviderGateway,
    private readonly paymentCloser: PaymentCloser,
    private readonly logger: ILogger,
  ) {}

  async execute(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new ResourceNotFoundException('Cobrança', paymentId);
    }

    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_CANCELLATION_SKIPPED, {
        ...this.buildLogFields(payment),
        paymentStatus: payment.status,
      });

      throw new ResourceConflictException(
        `Cobrança só pode ser cancelada no status PENDING. Status atual: "${payment.status}"`,
      );
    }

    try {
      await this.paymentProviderGateway.cancelCheckout(payment.checkoutId);
    } catch (error) {
      if (!(error instanceof ServiceRequestRejectedException)) {
        throw error;
      }

      return this.closePaymentWithCheckoutStatus(payment);
    }

    return this.paymentCloser.close(payment, PaymentStatus.CANCELLED);
  }

  // A refused cancellation means the checkout moved on: its own status decides the outcome.
  private async closePaymentWithCheckoutStatus(payment: Payment): Promise<Payment> {
    const checkout = await this.paymentProviderGateway.findCheckoutById(payment.checkoutId);
    const finalStatus = CheckoutStatusMapper.toFinalPaymentStatus(checkout.status);

    if (!finalStatus) {
      this.logger.event(BUSINESS_EVENTS.PAYMENT_CANCELLATION_SKIPPED, {
        ...this.buildLogFields(payment),
        checkoutStatus: checkout.status,
      });

      throw new ResourceConflictException(
        'A cobrança não pode ser cancelada enquanto o pagamento iniciado pelo cliente no Mercado Pago não for concluído. Ela será encerrada quando esse pagamento for confirmado ou expirar',
      );
    }

    const closed = await this.paymentCloser.close(payment, finalStatus);

    if (finalStatus === PaymentStatus.APPROVED) {
      throw new ResourceConflictException('A cobrança não pode ser cancelada porque já foi paga');
    }

    return closed;
  }

  private buildLogFields(payment: Payment) {
    return {
      paymentId: payment.id,
      workOrderId: payment.workOrderId,
      checkoutId: payment.checkoutId,
    };
  }
}
