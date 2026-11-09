import { PaymentCloser } from '@application/services/payment-closer';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { BUSINESS_METRICS } from '@application/metrics/business-metric.catalog';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IMetrics } from '@application/ports/output/services/metrics.service.interface';
import { FinalPaymentStatus, PaymentStatus } from '@domain/enums/payment-status.enum';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IRepositories, IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';

import { createMockLogger } from '../../../helpers/logger-mock.factory';
import { createMockMetrics } from '../../../helpers/metrics-mock.factory';
import { createMockPayment } from '../../../helpers/payment-mock.factory';
import { createMockUnitOfWorkWithRepos } from '../../../helpers/unit-of-work-mock.factory';

describe('PaymentCloser', () => {
  const now = new Date('2026-11-09T12:00:00.000Z');

  let closer: PaymentCloser;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let repos: jest.Mocked<IRepositories>;
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let outboxRepository: jest.Mocked<IOutboxRepository>;
  let logger: jest.Mocked<ILogger>;
  let metrics: jest.Mocked<IMetrics>;

  beforeEach(() => {
    jest.useFakeTimers({ now });

    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;
    repos = mock.repos;

    paymentRepository = repos.payment as jest.Mocked<IPaymentRepository>;
    paymentRepository.update.mockImplementation((payment) => Promise.resolve(payment));

    outboxRepository = repos.outbox as jest.Mocked<IOutboxRepository>;

    logger = createMockLogger();

    metrics = createMockMetrics();

    closer = new PaymentCloser(unitOfWork, logger, metrics);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should save the approved payment with its version and the approved message in one transaction', async () => {
    const payment = createMockPayment({ amount: 100.5, version: 3 });

    const closed = await closer.close(payment, PaymentStatus.APPROVED);

    expect(closed.status).toBe(PaymentStatus.APPROVED);
    expect(unitOfWork.executeTransaction).toHaveBeenCalledTimes(1);

    expect(paymentRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: payment.id, version: 3, status: PaymentStatus.APPROVED }),
    );

    expect(outboxRepository.add).toHaveBeenCalledWith({
      type: 'billing.payment.approved',
      workOrderId: payment.workOrderId,
      payload: { paymentId: payment.id, amount: '100.50', paidAt: now.toISOString() },
    });

    expect(paymentRepository.update.mock.invocationCallOrder[0]).toBeLessThan(
      outboxRepository.add.mock.invocationCallOrder[0],
    );
  });

  it.each([PaymentStatus.EXPIRED, PaymentStatus.CANCELLED, PaymentStatus.REJECTED] as const)(
    'should publish the failed message with the status as reason (%s)',
    async (status) => {
      const payment = createMockPayment();

      await closer.close(payment, status);

      expect(outboxRepository.add).toHaveBeenCalledWith({
        type: 'billing.payment.failed',
        workOrderId: payment.workOrderId,
        payload: { paymentId: payment.id, reason: status },
      });
    },
  );

  it.each([
    [PaymentStatus.APPROVED, BUSINESS_EVENTS.PAYMENT_APPROVED, {}],
    [PaymentStatus.CANCELLED, BUSINESS_EVENTS.PAYMENT_CANCELLED, {}],
    [
      PaymentStatus.EXPIRED,
      BUSINESS_EVENTS.PAYMENT_FAILED,
      { paymentStatus: PaymentStatus.EXPIRED },
    ],
    [
      PaymentStatus.REJECTED,
      BUSINESS_EVENTS.PAYMENT_FAILED,
      { paymentStatus: PaymentStatus.REJECTED },
    ],
  ] as const)(
    'should emit the resolved metric and the matching event after the commit (%s)',
    async (status: FinalPaymentStatus, event, extraFields) => {
      const payment = createMockPayment();
      const calls: string[] = [];

      unitOfWork.executeTransaction.mockImplementation(async (work) => {
        const result = await work(repos);
        calls.push('commit');

        return result;
      });

      metrics.increment.mockImplementation(() => {
        calls.push('metric');
      });

      logger.event.mockImplementation(() => {
        calls.push('event');
      });

      await closer.close(payment, status);

      expect(calls).toEqual(['commit', 'metric', 'event']);

      expect(metrics.increment).toHaveBeenCalledWith(BUSINESS_METRICS.PAYMENT_RESOLVED, {
        paymentStatus: status,
      });

      expect(logger.event).toHaveBeenCalledWith(event, {
        paymentId: payment.id,
        workOrderId: payment.workOrderId,
        checkoutId: payment.checkoutId,
        ...extraFields,
      });
    },
  );

  it('should emit nothing when the update fails on the version', async () => {
    paymentRepository.update.mockRejectedValue(
      new ConcurrencyException('A cobrança foi alterada por outra operação. Tente novamente'),
    );

    await expect(closer.close(createMockPayment(), PaymentStatus.APPROVED)).rejects.toThrow(
      ConcurrencyException,
    );

    expect(outboxRepository.add).not.toHaveBeenCalled();
    expect(metrics.increment).not.toHaveBeenCalled();
    expect(logger.event).not.toHaveBeenCalled();
  });
});
