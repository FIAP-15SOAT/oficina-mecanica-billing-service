import { randomUUID } from 'node:crypto';
import { Prisma } from '@generated/client';

import { PrismaPaymentRepository } from '@infrastructure/persistence/prisma/repositories/prisma-payment.repository';
import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';

import { Payment } from '@domain/entities/payment.entity';
import { PaymentStatus } from '@domain/enums/payment-status.enum';

import { createMockPayment } from '../../../../../helpers/payment-mock.factory';
import {
  createMockPrismaClient,
  MockPrismaService,
} from '../../../../../helpers/prisma-mock.factory';

function toRecord(payment: Payment) {
  return {
    id: payment.id,
    workOrderId: payment.workOrderId,
    amount: new Prisma.Decimal(payment.amount),
    status: payment.status,
    checkoutId: payment.checkoutId,
    checkoutUrl: payment.checkoutUrl,
    expiresAt: payment.expiresAt,
    version: payment.version,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function knownRequestError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: '7.10.1',
  });
}

describe('PrismaPaymentRepository', () => {
  let repository: PrismaPaymentRepository;
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = createMockPrismaClient();

    repository = new PrismaPaymentRepository(prisma);
  });

  describe('create', () => {
    it('should create the payment', async () => {
      const payment = createMockPayment();

      prisma.payment.create.mockResolvedValue(toRecord(payment));

      const result = await repository.create(payment);

      expect(result).toMatchObject({ id: payment.id, amount: payment.amount });

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          id: payment.id,
          workOrderId: payment.workOrderId,
          amount: payment.amount,
          status: PaymentStatus.PENDING,
          checkoutId: payment.checkoutId,
          checkoutUrl: payment.checkoutUrl,
          expiresAt: payment.expiresAt,
          version: 1,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
      });
    });

    it('should translate a duplicate pending payment into a concurrency conflict', async () => {
      prisma.payment.create.mockRejectedValue(knownRequestError('P2002'));

      await expect(repository.create(createMockPayment())).rejects.toThrow(
        new ConcurrencyException('A ordem de serviço já tem uma cobrança pendente'),
      );
    });

    it('should rethrow unexpected errors of the insert', async () => {
      const error = knownRequestError('P2003');
      prisma.payment.create.mockRejectedValue(error);

      await expect(repository.create(createMockPayment())).rejects.toBe(error);
    });
  });

  describe('update', () => {
    it('should update with the read version and increment it', async () => {
      const payment = createMockPayment({ version: 3 });

      payment.resolve(PaymentStatus.APPROVED);

      prisma.payment.update.mockResolvedValue({ ...toRecord(payment), version: 4 });

      const result = await repository.update(payment);

      expect(result.version).toBe(4);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: payment.id, version: 3 },
        data: {
          status: PaymentStatus.APPROVED,
          updatedAt: payment.updatedAt,
          version: { increment: 1 },
        },
      });
    });

    it('should raise a concurrency conflict when the version is stale', async () => {
      prisma.payment.update.mockRejectedValue(knownRequestError('P2025'));

      await expect(repository.update(createMockPayment())).rejects.toThrow(
        new ConcurrencyException('A cobrança foi alterada por outra operação. Tente novamente'),
      );
    });

    it('should rethrow unexpected errors of the update', async () => {
      const error = new Error('connection lost');
      prisma.payment.update.mockRejectedValue(error);

      await expect(repository.update(createMockPayment())).rejects.toBe(error);
    });
  });

  describe('finders', () => {
    it('should find by id, by checkout id and by work order ordered by creation', async () => {
      const payment = createMockPayment();

      prisma.payment.findUnique.mockResolvedValue(toRecord(payment));
      prisma.payment.findMany.mockResolvedValue([toRecord(payment)]);

      const byId = await repository.findById(payment.id);
      const byCheckoutId = await repository.findByCheckoutId(payment.checkoutId);
      const byWorkOrder = await repository.findByWorkOrderId(payment.workOrderId);

      expect(byId?.id).toBe(payment.id);
      expect(byCheckoutId?.id).toBe(payment.id);
      expect(byWorkOrder.map((p) => p.id)).toEqual([payment.id]);
      expect(prisma.payment.findUnique).toHaveBeenCalledWith({ where: { id: payment.id } });

      expect(prisma.payment.findUnique).toHaveBeenCalledWith({
        where: { checkoutId: payment.checkoutId },
      });

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { workOrderId: payment.workOrderId },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return null when the payment does not exist', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(repository.findById(randomUUID())).resolves.toBeNull();
      await expect(repository.findByCheckoutId('ORD01UNKNOWN')).resolves.toBeNull();
    });
  });

  describe('findAllPaginated', () => {
    it('should paginate with the work order and status filters, newest first', async () => {
      const payment = createMockPayment();

      prisma.payment.findMany.mockResolvedValue([toRecord(payment)]);
      prisma.payment.count.mockResolvedValue(11);

      const result = await repository.findAllPaginated(
        { page: 2, limit: 10 },
        { workOrderId: payment.workOrderId, status: PaymentStatus.PENDING },
      );

      expect(result.total).toBe(11);
      expect(result.items.map((p) => p.id)).toEqual([payment.id]);

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { workOrderId: payment.workOrderId, status: PaymentStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
    });
  });
});
