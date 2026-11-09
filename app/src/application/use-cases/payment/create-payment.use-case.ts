import { randomUUID } from 'node:crypto';

import { Payment } from '@domain/entities/payment.entity';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { BUSINESS_METRICS } from '@application/metrics/business-metric.catalog';
import { ICreatePaymentUseCase } from '@application/ports/input/payment/create-payment.use-case.interface';
import { CreatePaymentDto } from '@application/ports/input/payment/dto/create-payment.dto';
import { IPaymentProviderGateway } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IMetrics } from '@application/ports/output/services/metrics.service.interface';
import { WorkOrderBalanceReader } from '@application/services/work-order-balance-reader';
import { parseIsoDurationMs } from '@application/utils/iso-duration.util';

const CHARGEABLE_WORK_ORDER_STATUSES = [WorkOrderStatus.APPROVED, WorkOrderStatus.COMPLETED];

export class CreatePaymentUseCase implements ICreatePaymentUseCase {
  private readonly orderExpirationMs: number;

  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly workOrderGateway: IWorkOrderGateway,
    private readonly paymentProviderGateway: IPaymentProviderGateway,
    private readonly workOrderBalanceReader: WorkOrderBalanceReader,
    private readonly logger: ILogger,
    private readonly metrics: IMetrics,
    private readonly orderExpiration: string,
  ) {
    this.orderExpirationMs = parseIsoDurationMs(orderExpiration);
  }

  async execute(input: CreatePaymentDto): Promise<Payment> {
    const workOrder = await this.workOrderGateway.findById(input.workOrderId);

    if (!CHARGEABLE_WORK_ORDER_STATUSES.includes(workOrder.status)) {
      throw new ResourceConflictException(
        `Cobrança só pode ser criada com a Ordem de Serviço em um dos seguintes status: APPROVED ou COMPLETED. Status atual: "${workOrder.status}"`,
      );
    }

    const { balance, hasPendingPayment } = await this.workOrderBalanceReader.read(
      input.workOrderId,
    );

    if (hasPendingPayment) {
      throw new ResourceConflictException('A ordem de serviço já tem uma cobrança pendente');
    }

    Payment.ensureChargeableAmount(input.amount, balance);

    const paymentId = randomUUID();

    const checkout = await this.paymentProviderGateway.createCheckout({
      paymentId,
      amount: input.amount.toFixed(2),
      title: `Ordem de serviço ${workOrder.number}`,
      expirationTime: this.orderExpiration,
    });

    const payment = Payment.create({
      id: paymentId,
      workOrderId: input.workOrderId,
      amount: input.amount,
      checkoutId: checkout.id,
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: new Date(Date.now() + this.orderExpirationMs),
    });

    // A concurrent creation that passed the pending check fails here on the partial unique index.
    const created = await this.unitOfWork.executeTransaction(async (repos) => {
      const saved = await repos.payment.create(payment);

      await repos.outbox.add({
        type: 'billing.payment.requested',
        workOrderId: saved.workOrderId,
        payload: {
          paymentId: saved.id,
          amount: saved.amount.toFixed(2),
          checkoutUrl: saved.checkoutUrl,
          expiresAt: saved.expiresAt.toISOString(),
        },
      });

      return saved;
    });

    this.metrics.increment(BUSINESS_METRICS.PAYMENT_REQUESTED, {});

    this.logger.event(BUSINESS_EVENTS.PAYMENT_REQUESTED, {
      paymentId: created.id,
      workOrderId: created.workOrderId,
      checkoutId: created.checkoutId,
    });

    return created;
  }
}
