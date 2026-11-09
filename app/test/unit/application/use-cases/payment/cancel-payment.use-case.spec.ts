import { CancelPaymentUseCase } from '@application/use-cases/payment/cancel-payment.use-case';
import { PaymentCloser } from '@application/services/payment-closer';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import { IPaymentProviderGateway } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.interface';
import { CheckoutStatus } from '@application/ports/output/gateways/payment-provider/payment-provider-gateway.response';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IRepositories, IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';

import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { createMockPaymentProviderGateway } from '../../../../helpers/payment-provider-gateway-mock.factory';
import { createMockMetrics } from '../../../../helpers/metrics-mock.factory';
import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../../helpers/payment-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../../helpers/unit-of-work-mock.factory';

describe('CancelPaymentUseCase', () => {
  const checkoutId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
  const refusal = new ServiceRequestRejectedException(
    409,
    'O Mercado Pago recusou o cancelamento da order',
  );

  let useCase: CancelPaymentUseCase;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let repos: jest.Mocked<IRepositories>;
  let transactionPaymentRepository: jest.Mocked<IPaymentRepository>;
  let outboxRepository: jest.Mocked<IOutboxRepository>;
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let paymentProviderGateway: jest.Mocked<IPaymentProviderGateway>;
  let logger: jest.Mocked<ILogger>;

  beforeEach(() => {
    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;
    repos = mock.repos;

    transactionPaymentRepository = repos.payment as jest.Mocked<IPaymentRepository>;
    transactionPaymentRepository.update.mockImplementation((payment) => Promise.resolve(payment));

    outboxRepository = repos.outbox as jest.Mocked<IOutboxRepository>;

    paymentRepository = createMockPaymentRepository();

    paymentProviderGateway = createMockPaymentProviderGateway();

    logger = createMockLogger();

    useCase = new CancelPaymentUseCase(
      paymentRepository,
      paymentProviderGateway,
      new PaymentCloser(unitOfWork, logger, createMockMetrics()),
      logger,
    );
  });

  it('should cancel the checkout and resolve the payment as CANCELLED', async () => {
    const payment = createMockPayment({ checkoutId });

    paymentRepository.findById.mockResolvedValue(payment);

    paymentProviderGateway.cancelCheckout.mockResolvedValue({
      id: checkoutId,
      status: CheckoutStatus.CANCELLED,
    });

    const result = await useCase.execute(payment.id);

    expect(paymentProviderGateway.cancelCheckout).toHaveBeenCalledWith(checkoutId);
    expect(paymentProviderGateway.findCheckoutById).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.CANCELLED);

    expect(outboxRepository.add).toHaveBeenCalledWith({
      type: 'billing.payment.failed',
      workOrderId: payment.workOrderId,
      payload: { paymentId: payment.id, reason: PaymentStatus.CANCELLED },
    });
  });

  it.each([
    [CheckoutStatus.EXPIRED, PaymentStatus.EXPIRED],
    [CheckoutStatus.CANCELLED, PaymentStatus.CANCELLED],
    [CheckoutStatus.FAILED, PaymentStatus.REJECTED],
  ])(
    'should close the payment with the checkout status when the cancellation is refused and the checkout already ended (%s)',
    async (orderStatus, paymentStatus) => {
      const payment = createMockPayment({ checkoutId });

      paymentRepository.findById.mockResolvedValue(payment);
      paymentProviderGateway.cancelCheckout.mockRejectedValue(refusal);
      paymentProviderGateway.findCheckoutById.mockResolvedValue({
        id: checkoutId,
        status: orderStatus,
      });

      const result = await useCase.execute(payment.id);

      expect(paymentProviderGateway.findCheckoutById).toHaveBeenCalledWith(checkoutId);
      expect(result.status).toBe(paymentStatus);

      expect(outboxRepository.add).toHaveBeenCalledWith({
        type: 'billing.payment.failed',
        workOrderId: payment.workOrderId,
        payload: { paymentId: payment.id, reason: paymentStatus },
      });
    },
  );

  it('should resolve as APPROVED and raise a conflict when the checkout was paid', async () => {
    const payment = createMockPayment({ checkoutId });

    paymentRepository.findById.mockResolvedValue(payment);
    paymentProviderGateway.cancelCheckout.mockRejectedValue(refusal);
    paymentProviderGateway.findCheckoutById.mockResolvedValue({
      id: checkoutId,
      status: CheckoutStatus.PAID,
    });

    const execution = useCase.execute(payment.id);

    await expect(execution).rejects.toThrow(ResourceConflictException);
    await expect(execution).rejects.toThrow('A cobrança não pode ser cancelada porque já foi paga');

    expect(transactionPaymentRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: payment.id, status: PaymentStatus.APPROVED }),
    );

    expect(outboxRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'billing.payment.approved' }),
    );
  });

  it.each([CheckoutStatus.OPEN, CheckoutStatus.IN_PROGRESS])(
    'should keep the payment PENDING and raise a conflict while the payment is in progress (%s)',
    async (orderStatus) => {
      const payment = createMockPayment({ checkoutId });

      paymentRepository.findById.mockResolvedValue(payment);
      paymentProviderGateway.cancelCheckout.mockRejectedValue(refusal);
      paymentProviderGateway.findCheckoutById.mockResolvedValue({
        id: checkoutId,
        status: orderStatus,
      });

      const execution = useCase.execute(payment.id);

      await expect(execution).rejects.toThrow(ResourceConflictException);

      await expect(execution).rejects.toThrow(
        'A cobrança não pode ser cancelada enquanto o pagamento iniciado pelo cliente no Mercado Pago não for concluído. Ela será encerrada quando esse pagamento for confirmado ou expirar',
      );

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();

      expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_CANCELLATION_SKIPPED, {
        paymentId: payment.id,
        workOrderId: payment.workOrderId,
        checkoutId,
        checkoutStatus: orderStatus,
      });
    },
  );

  it('should raise a conflict for a payment outside PENDING without calling the payment provider', async () => {
    const payment = createMockPayment({ checkoutId, status: PaymentStatus.EXPIRED });

    paymentRepository.findById.mockResolvedValue(payment);

    const execution = useCase.execute(payment.id);

    await expect(execution).rejects.toThrow(ResourceConflictException);

    await expect(execution).rejects.toThrow(
      'Cobrança só pode ser cancelada no status PENDING. Status atual: "EXPIRED"',
    );

    expect(paymentProviderGateway.cancelCheckout).not.toHaveBeenCalled();

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_CANCELLATION_SKIPPED, {
      paymentId: payment.id,
      workOrderId: payment.workOrderId,
      checkoutId,
      paymentStatus: PaymentStatus.EXPIRED,
    });
  });

  it('should raise not found for an unknown payment', async () => {
    paymentRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('7d9f2c4e-1b3a-4c5d-8e6f-9a0b1c2d3e4f')).rejects.toThrow(
      ResourceNotFoundException,
    );

    expect(paymentProviderGateway.cancelCheckout).not.toHaveBeenCalled();
  });

  it('should propagate an unavailable payment provider without changing the payment', async () => {
    const payment = createMockPayment({ checkoutId });

    paymentRepository.findById.mockResolvedValue(payment);
    paymentProviderGateway.cancelCheckout.mockRejectedValue(
      new ServiceIntegrationException(
        'Não foi possível cancelar a order no Mercado Pago. Nada mudou; tente novamente',
      ),
    );

    await expect(useCase.execute(payment.id)).rejects.toThrow(ServiceIntegrationException);

    expect(paymentProviderGateway.findCheckoutById).not.toHaveBeenCalled();
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
  });
});
