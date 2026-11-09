import { CreatePaymentUseCase } from '@application/use-cases/payment/create-payment.use-case';
import { WorkOrderBalanceReader } from '@application/services/work-order-balance-reader';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { BUSINESS_METRICS } from '@application/metrics/business-metric.catalog';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { IMercadoPagoOrderGateway } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.interface';
import { MercadoPagoOrderStatus } from '@application/ports/output/gateways/mercado-pago/mercado-pago-order-gateway.response';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IMetrics } from '@application/ports/output/services/metrics.service.interface';
import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { DomainValidationException } from '@domain/exceptions/domain-validation.exception';
import { IOutboxRepository } from '@domain/interfaces/repositories/outbox.repository.interface';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';
import { IRepositories, IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';

import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { createMockMercadoPagoOrderGateway } from '../../../../helpers/mercado-pago-order-gateway-mock.factory';
import { createMockMetrics } from '../../../../helpers/metrics-mock.factory';
import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../../helpers/payment-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import {
  createMockQuoteRepository,
  createMockUnitOfWorkWithRepos,
} from '../../../../helpers/unit-of-work-mock.factory';
import {
  createMockWorkOrderGateway,
  createMockWorkOrderGatewayResponse,
} from '../../../../helpers/work-order-gateway-mock.factory';

describe('CreatePaymentUseCase', () => {
  const now = new Date('2026-11-08T12:00:00.000Z');
  const checkoutId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
  const checkoutUrl = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1';
  const workOrder = createMockWorkOrderGatewayResponse({
    status: WorkOrderStatus.APPROVED,
    number: '000123',
  });

  let useCase: CreatePaymentUseCase;
  let unitOfWork: jest.Mocked<IUnitOfWork>;
  let repos: jest.Mocked<IRepositories>;
  let transactionPaymentRepository: jest.Mocked<IPaymentRepository>;
  let outboxRepository: jest.Mocked<IOutboxRepository>;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let workOrderGateway: jest.Mocked<IWorkOrderGateway>;
  let mercadoPagoOrderGateway: jest.Mocked<IMercadoPagoOrderGateway>;
  let logger: jest.Mocked<ILogger>;
  let metrics: jest.Mocked<IMetrics>;

  beforeEach(() => {
    jest.useFakeTimers({ now });

    const mock = createMockUnitOfWorkWithRepos();
    unitOfWork = mock.unitOfWork;
    repos = mock.repos;

    transactionPaymentRepository = repos.payment as jest.Mocked<IPaymentRepository>;
    transactionPaymentRepository.create.mockImplementation((payment) => Promise.resolve(payment));

    outboxRepository = repos.outbox as jest.Mocked<IOutboxRepository>;

    quoteRepository = createMockQuoteRepository();
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      createMockQuote({
        workOrderId: workOrder.id,
        status: QuoteStatus.APPROVED,
        totalAmount: 500,
      }),
    ]);

    paymentRepository = createMockPaymentRepository();
    paymentRepository.findByWorkOrderId.mockResolvedValue([]);

    workOrderGateway = createMockWorkOrderGateway();
    workOrderGateway.findById.mockResolvedValue(workOrder);

    mercadoPagoOrderGateway = createMockMercadoPagoOrderGateway();
    mercadoPagoOrderGateway.createOrder.mockResolvedValue({
      id: checkoutId,
      status: MercadoPagoOrderStatus.CREATED,
      checkoutUrl,
    });

    logger = createMockLogger();

    metrics = createMockMetrics();

    useCase = new CreatePaymentUseCase(
      unitOfWork,
      workOrderGateway,
      mercadoPagoOrderGateway,
      new WorkOrderBalanceReader(quoteRepository, paymentRepository),
      logger,
      metrics,
      'P1D',
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should create the order and save the PENDING payment with the requested message in one transaction', async () => {
    const payment = await useCase.execute({ workOrderId: workOrder.id, amount: 100 });

    expect(payment).toMatchObject({
      workOrderId: workOrder.id,
      amount: 100,
      status: PaymentStatus.PENDING,
      checkoutId,
      checkoutUrl,
      expiresAt: new Date('2026-11-09T12:00:00.000Z'),
    });

    expect(unitOfWork.executeTransaction).toHaveBeenCalledTimes(1);
    expect(transactionPaymentRepository.create).toHaveBeenCalledWith(payment);

    expect(outboxRepository.add).toHaveBeenCalledWith({
      type: 'billing.payment.requested',
      workOrderId: workOrder.id,
      payload: {
        paymentId: payment.id,
        amount: '100.00',
        checkoutUrl,
        expiresAt: '2026-11-09T12:00:00.000Z',
      },
    });
  });

  it('should send the payment id, the amount with two decimals, the work order number and the configured expiration', async () => {
    const payment = await useCase.execute({ workOrderId: workOrder.id, amount: 100.5 });

    expect(workOrderGateway.findById).toHaveBeenCalledWith(workOrder.id);

    expect(mercadoPagoOrderGateway.createOrder).toHaveBeenCalledWith({
      paymentId: payment.id,
      amount: '100.50',
      title: 'Ordem de serviço 000123',
      expirationTime: 'P1D',
    });
  });

  it.each(
    Object.values(WorkOrderStatus).filter(
      (status) => status !== WorkOrderStatus.APPROVED && status !== WorkOrderStatus.COMPLETED,
    ),
  )(
    'should refuse a work order outside APPROVED or COMPLETED without calling Mercado Pago (%s)',
    async (status) => {
      workOrderGateway.findById.mockResolvedValue({ ...workOrder, status });

      const execution = useCase.execute({ workOrderId: workOrder.id, amount: 100 });

      await expect(execution).rejects.toThrow(ResourceConflictException);
      await expect(execution).rejects.toThrow(
        `Cobrança só pode ser criada com a Ordem de Serviço em um dos seguintes status: APPROVED ou COMPLETED. Status atual: "${status}"`,
      );
      expect(mercadoPagoOrderGateway.createOrder).not.toHaveBeenCalled();
    },
  );

  it('should accept a COMPLETED work order', async () => {
    workOrderGateway.findById.mockResolvedValue({
      ...workOrder,
      status: WorkOrderStatus.COMPLETED,
    });

    await expect(
      useCase.execute({ workOrderId: workOrder.id, amount: 100 }),
    ).resolves.toMatchObject({ status: PaymentStatus.PENDING });
  });

  it('should refuse a second pending payment without calling Mercado Pago', async () => {
    paymentRepository.findByWorkOrderId.mockResolvedValue([
      createMockPayment({ workOrderId: workOrder.id, status: PaymentStatus.PENDING }),
    ]);

    const execution = useCase.execute({ workOrderId: workOrder.id, amount: 100 });

    await expect(execution).rejects.toThrow(ResourceConflictException);
    await expect(execution).rejects.toThrow('A ordem de serviço já tem uma cobrança pendente');
    expect(mercadoPagoOrderGateway.createOrder).not.toHaveBeenCalled();
  });

  it('should refuse an amount above the balance without calling Mercado Pago', async () => {
    paymentRepository.findByWorkOrderId.mockResolvedValue([
      createMockPayment({ workOrderId: workOrder.id, amount: 450, status: PaymentStatus.APPROVED }),
    ]);

    const execution = useCase.execute({ workOrderId: workOrder.id, amount: 50.01 });

    await expect(execution).rejects.toThrow(DomainValidationException);
    await expect(execution).rejects.toThrow(
      'O valor da cobrança não pode ser maior que o saldo da ordem de serviço. Saldo atual: 50.00',
    );
    expect(mercadoPagoOrderGateway.createOrder).not.toHaveBeenCalled();
  });

  it('should save nothing when Mercado Pago fails', async () => {
    mercadoPagoOrderGateway.createOrder.mockRejectedValue(
      new ServiceIntegrationException(
        'Não foi possível criar a cobrança no Mercado Pago. Nada foi gravado; tente novamente',
      ),
    );

    await expect(useCase.execute({ workOrderId: workOrder.id, amount: 100 })).rejects.toThrow(
      ServiceIntegrationException,
    );

    expect(unitOfWork.executeTransaction).not.toHaveBeenCalled();
    expect(metrics.increment).not.toHaveBeenCalled();
    expect(logger.event).not.toHaveBeenCalled();
  });

  it('should emit the requested metric and event only after the commit', async () => {
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

    const payment = await useCase.execute({ workOrderId: workOrder.id, amount: 100 });

    expect(calls).toEqual(['commit', 'metric', 'event']);
    expect(metrics.increment).toHaveBeenCalledWith(BUSINESS_METRICS.PAYMENT_REQUESTED, {});

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.PAYMENT_REQUESTED, {
      paymentId: payment.id,
      workOrderId: workOrder.id,
      checkoutId,
    });
  });

  it('should fail at construction with an invalid expiration', () => {
    expect(
      () =>
        new CreatePaymentUseCase(
          unitOfWork,
          workOrderGateway,
          mercadoPagoOrderGateway,
          new WorkOrderBalanceReader(quoteRepository, paymentRepository),
          logger,
          metrics,
          'P1W',
        ),
    ).toThrow('Duração ISO 8601 inválida: "P1W"');
  });
});
