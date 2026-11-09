import { SyncPaymentStatusUseCase } from '@application/use-cases/payment/sync-payment-status.use-case';
import { PaymentCloser } from '@application/services/payment-closer';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { IMercadoPagoOrderGateway } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.interface';
import { MercadoPagoOrderStatus } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.response';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IRepositories, IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';

import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { createMockMercadoPagoOrderGateway } from '../../../../helpers/mercado-pago-order-gateway-mock.factory';
import { createMockMetrics } from '../../../../helpers/metrics-mock.factory';
import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../../helpers/payment-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../../helpers/unit-of-work-mock.factory';

describe('SyncPaymentStatusUseCase', () => {
  const checkoutId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';

  let useCase: SyncPaymentStatusUseCase;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let repos: jest.Mocked<IRepositories>;
  let transactionPaymentRepository: jest.Mocked<IPaymentRepository>;
  let outboxRepository: jest.Mocked<IOutboxRepository>;
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let mercadoPagoOrderGateway: jest.Mocked<IMercadoPagoOrderGateway>;
  let logger: jest.Mocked<ILogger>;

  beforeEach(() => {
    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;
    repos = mock.repos;

    transactionPaymentRepository = repos.payment as jest.Mocked<IPaymentRepository>;
    transactionPaymentRepository.update.mockImplementation((payment) => Promise.resolve(payment));

    outboxRepository = repos.outbox as jest.Mocked<IOutboxRepository>;

    paymentRepository = createMockPaymentRepository();

    mercadoPagoOrderGateway = createMockMercadoPagoOrderGateway();

    logger = createMockLogger();

    useCase = new SyncPaymentStatusUseCase(
      paymentRepository,
      mercadoPagoOrderGateway,
      new PaymentCloser(unitOfWork, logger, createMockMetrics()),
      logger,
    );
  });

  it('should close a PENDING payment from the order status', async () => {
    const payment = createMockPayment({ checkoutId });

    paymentRepository.findByCheckoutId.mockResolvedValue(payment);
    mercadoPagoOrderGateway.findOrderById.mockResolvedValue({
      id: checkoutId,
      status: MercadoPagoOrderStatus.PROCESSED,
    });

    await useCase.execute(checkoutId);

    expect(paymentRepository.findByCheckoutId).toHaveBeenCalledWith(checkoutId);
    expect(mercadoPagoOrderGateway.findOrderById).toHaveBeenCalledWith(checkoutId);

    expect(transactionPaymentRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: payment.id, status: PaymentStatus.APPROVED }),
    );

    expect(outboxRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'billing.payment.approved' }),
    );
  });

  it('should skip an unknown order without calling Mercado Pago', async () => {
    paymentRepository.findByCheckoutId.mockResolvedValue(null);

    await useCase.execute(checkoutId);

    expect(mercadoPagoOrderGateway.findOrderById).not.toHaveBeenCalled();
    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, {
      checkoutId,
    });
  });

  it.each([PaymentStatus.EXPIRED, PaymentStatus.CANCELLED, PaymentStatus.REJECTED])(
    'should skip a payment closed without approval without calling Mercado Pago (%s)',
    async (status) => {
      const payment = createMockPayment({ checkoutId, status });
      paymentRepository.findByCheckoutId.mockResolvedValue(payment);

      await useCase.execute(checkoutId);

      expect(mercadoPagoOrderGateway.findOrderById).not.toHaveBeenCalled();
      expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();

      expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, {
        paymentId: payment.id,
        workOrderId: payment.workOrderId,
        checkoutId,
        paymentStatus: status,
      });
    },
  );

  it('should skip a repeated notification of an APPROVED payment', async () => {
    const payment = createMockPayment({ checkoutId, status: PaymentStatus.APPROVED });

    paymentRepository.findByCheckoutId.mockResolvedValue(payment);
    mercadoPagoOrderGateway.findOrderById.mockResolvedValue({
      id: checkoutId,
      status: MercadoPagoOrderStatus.PROCESSED,
    });

    await useCase.execute(checkoutId);

    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, {
      paymentId: payment.id,
      workOrderId: payment.workOrderId,
      checkoutId,
      paymentStatus: PaymentStatus.APPROVED,
      checkoutStatus: MercadoPagoOrderStatus.PROCESSED,
    });
  });

  it.each([
    MercadoPagoOrderStatus.CREATED,
    MercadoPagoOrderStatus.ACTION_REQUIRED,
    MercadoPagoOrderStatus.PROCESSING,
  ])('should keep the payment PENDING while the order is open (%s)', async (status) => {
    const payment = createMockPayment({ checkoutId });

    paymentRepository.findByCheckoutId.mockResolvedValue(payment);
    mercadoPagoOrderGateway.findOrderById.mockResolvedValue({ id: checkoutId, status });

    await useCase.execute(checkoutId);

    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_SYNC_SKIPPED, {
      paymentId: payment.id,
      workOrderId: payment.workOrderId,
      checkoutId,
      paymentStatus: PaymentStatus.PENDING,
      checkoutStatus: status,
    });
  });

  it.each([
    [PaymentStatus.APPROVED, MercadoPagoOrderStatus.REFUNDED],
    [PaymentStatus.APPROVED, MercadoPagoOrderStatus.CHARGED_BACK],
    [PaymentStatus.PENDING, MercadoPagoOrderStatus.REFUNDED],
    [PaymentStatus.PENDING, MercadoPagoOrderStatus.CHARGED_BACK],
  ])(
    'should only log a refunded or charged back order (%s payment, %s order)',
    async (paymentStatus, orderStatus) => {
      const payment = createMockPayment({ checkoutId, status: paymentStatus });

      paymentRepository.findByCheckoutId.mockResolvedValue(payment);
      mercadoPagoOrderGateway.findOrderById.mockResolvedValue({
        id: checkoutId,
        status: orderStatus,
      });

      await useCase.execute(checkoutId);

      expect(payment.status).toBe(paymentStatus);
      expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();

      expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_CHECKOUT_REVERSED, {
        paymentId: payment.id,
        workOrderId: payment.workOrderId,
        checkoutId,
        checkoutStatus: orderStatus,
      });
    },
  );
});
