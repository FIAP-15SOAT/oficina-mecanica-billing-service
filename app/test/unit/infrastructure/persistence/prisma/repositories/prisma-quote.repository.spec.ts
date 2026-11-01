import { randomUUID } from 'node:crypto';
import { Prisma } from '@generated/client';

import { PrismaQuoteRepository } from '@infrastructure/persistence/prisma/repositories/prisma-quote.repository';
import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';

import { Quote } from '@domain/entities/quote.entity';
import { QuoteService } from '@domain/entities/quote-service.entity';
import { QuotePartSupply } from '@domain/entities/quote-part-supply.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

import {
  createMockPrismaClient,
  MockPrismaService,
} from '../../../../../helpers/prisma-mock.factory';

function toRecord(quote: Quote) {
  return {
    id: quote.id,
    workOrderId: quote.workOrderId,
    servicesAmount: new Prisma.Decimal(quote.servicesAmount),
    partsAmount: new Prisma.Decimal(quote.partsAmount),
    totalAmount: new Prisma.Decimal(quote.totalAmount),
    version: quote.version,
    status: quote.status,
    notes: quote.notes,
    sentAt: quote.sentAt,
    approvedAt: quote.approvedAt,
    rejectedAt: quote.rejectedAt,
    replacedByQuoteId: quote.replacedByQuoteId,
    rejectionReason: quote.rejectionReason,
    decidedBy: quote.decidedBy,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  };
}

function itemRecord(quoteId: string) {
  const now = new Date();
  return {
    quoteId,
    quantity: 3,
    unitPrice: new Prisma.Decimal(0.1),
    totalPrice: new Prisma.Decimal(0.3),
    createdAt: now,
    updatedAt: now,
  };
}

describe('PrismaQuoteRepository', () => {
  let repository: PrismaQuoteRepository;
  let prisma: MockPrismaService;

  const serviceId = randomUUID();
  const partSupplyId = randomUUID();

  beforeEach(() => {
    prisma = createMockPrismaClient();
    repository = new PrismaQuoteRepository(prisma);
  });

  describe('create', () => {
    it('should create the quote with its items in a single nested create', async () => {
      const quote = Quote.create({
        workOrderId: randomUUID(),
        notes: 'Notas',
        services: [{ serviceId, unitPrice: 100, quantity: 2 }],
        partsSupplies: [{ partSupplyId, unitPrice: 25, quantity: 1 }],
      });

      prisma.quote.create.mockResolvedValue({
        ...toRecord(quote),
        services: [],
        partsSupplies: [],
      });

      const result = await repository.create(quote);

      expect(result.id).toBe(quote.id);
      expect(prisma.quote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: quote.id,
          workOrderId: quote.workOrderId,
          totalAmount: 225,
          version: 1,
          status: QuoteStatus.PENDING,
          services: {
            create: [{ serviceId, quantity: 2, unitPrice: 100, totalPrice: 200 }],
          },
          partsSupplies: {
            create: [{ partSupplyId, quantity: 1, unitPrice: 25, totalPrice: 25 }],
          },
        }),
        include: { services: true, partsSupplies: true },
      });
    });
  });

  describe('findById', () => {
    it('should return the quote without items when found', async () => {
      const quote = Quote.create({ workOrderId: randomUUID() });

      prisma.quote.findUnique.mockResolvedValue(toRecord(quote));

      const result = await repository.findById(quote.id);

      expect(result?.id).toBe(quote.id);
      expect(prisma.quote.findUnique).toHaveBeenCalledWith({ where: { id: quote.id } });
    });

    it('should return null when not found', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);

      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });
  });

  describe('findByIdWithDetails', () => {
    it('should return the quote with its items when found', async () => {
      const quote = Quote.create({ workOrderId: randomUUID() });

      prisma.quote.findUnique.mockResolvedValue({
        ...toRecord(quote),
        services: [{ ...itemRecord(quote.id), serviceId }],
        partsSupplies: [{ ...itemRecord(quote.id), partSupplyId }],
      });

      const result = await repository.findByIdWithDetails(quote.id);

      expect(result?.services[0].serviceId).toBe(serviceId);
      expect(result?.partsSupplies[0].partSupplyId).toBe(partSupplyId);
      expect(prisma.quote.findUnique).toHaveBeenCalledWith({
        where: { id: quote.id },
        include: { services: true, partsSupplies: true },
      });
    });

    it('should return null when not found', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);

      await expect(repository.findByIdWithDetails(randomUUID())).resolves.toBeNull();
    });
  });

  describe('findByWorkOrderId', () => {
    it('should return the quotes of the work order, newest first', async () => {
      const quote = Quote.create({ workOrderId: randomUUID() });

      prisma.quote.findMany.mockResolvedValue([toRecord(quote)]);

      const result = await repository.findByWorkOrderId(quote.workOrderId);

      expect(result.map((q) => q.id)).toEqual([quote.id]);
      expect(prisma.quote.findMany).toHaveBeenCalledWith({
        where: { workOrderId: quote.workOrderId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findAllPaginated', () => {
    it('should apply the filters and paginate', async () => {
      const quote = Quote.create({ workOrderId: randomUUID() });

      prisma.quote.findMany.mockResolvedValue([toRecord(quote)]);
      prisma.quote.count.mockResolvedValue(11);

      const result = await repository.findAllPaginated(
        { page: 2, limit: 10 },
        { workOrderId: quote.workOrderId, status: QuoteStatus.PENDING },
      );

      expect(result.total).toBe(11);
      expect(result.items[0].id).toBe(quote.id);
      expect(prisma.quote.findMany).toHaveBeenCalledWith({
        where: { workOrderId: quote.workOrderId, status: QuoteStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
    });

    it('should not filter when no filter is given', async () => {
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);

      await repository.findAllPaginated({ page: 1, limit: 10 }, {});

      expect(prisma.quote.count).toHaveBeenCalledWith({ where: {} });
    });
  });

  describe('update', () => {
    it('should write every column guarded by the version and increment it', async () => {
      const quote = Quote.create({ workOrderId: randomUUID() });

      quote.rejectByApprovalOf(randomUUID());

      prisma.quote.update.mockResolvedValue({
        ...toRecord(quote),
        version: 2,
        services: [],
        partsSupplies: [],
      });

      const result = await repository.update(quote);

      expect(result.version).toBe(2);
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: quote.id, version: 1 },
        data: {
          servicesAmount: 0,
          partsAmount: 0,
          totalAmount: 0,
          status: QuoteStatus.REJECTED,
          notes: null,
          sentAt: null,
          approvedAt: null,
          rejectedAt: quote.rejectedAt,
          replacedByQuoteId: quote.replacedByQuoteId,
          rejectionReason: null,
          decidedBy: null,
          updatedAt: quote.updatedAt,
          version: { increment: 1 },
        },
        include: { services: true, partsSupplies: true },
      });
    });

    it('should throw ConcurrencyException when the version is stale', async () => {
      prisma.quote.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '7.10.1',
        }),
      );

      await expect(repository.update(Quote.create({ workOrderId: randomUUID() }))).rejects.toThrow(
        new ConcurrencyException('Orçamento foi modificado por outra operação. Tente novamente'),
      );
    });

    it('should rethrow unexpected errors', async () => {
      const error = new Error('connection lost');
      prisma.quote.update.mockRejectedValue(error);

      await expect(repository.update(Quote.create({ workOrderId: randomUUID() }))).rejects.toBe(
        error,
      );
    });
  });

  describe('delete', () => {
    it('should delete the quote by id', async () => {
      const id = randomUUID();

      await repository.delete(id);

      expect(prisma.quote.delete).toHaveBeenCalledWith({ where: { id } });
    });
  });

  describe('service items', () => {
    const quoteId = randomUUID();
    const item = QuoteService.create({ quoteId, serviceId, quantity: 2, unitPrice: 50 });

    it('should insert a service item', async () => {
      await repository.addServiceItem(item);

      expect(prisma.quoteService.create).toHaveBeenCalledWith({
        data: { quoteId, serviceId, quantity: 2, unitPrice: 50, totalPrice: 100 },
      });
    });

    it('should delete a service item', async () => {
      await repository.removeServiceItem(quoteId, serviceId);

      expect(prisma.quoteService.delete).toHaveBeenCalledWith({
        where: { quoteId_serviceId: { quoteId, serviceId } },
      });
    });

    it('should update the quantity of a service item', async () => {
      await repository.updateServiceItemQuantity(item);

      expect(prisma.quoteService.update).toHaveBeenCalledWith({
        where: { quoteId_serviceId: { quoteId, serviceId } },
        data: { quantity: 2, totalPrice: 100, updatedAt: item.updatedAt },
      });
    });
  });

  describe('part supply items', () => {
    const quoteId = randomUUID();
    const item = QuotePartSupply.create({ quoteId, partSupplyId, quantity: 4, unitPrice: 5 });

    it('should insert a part supply item', async () => {
      await repository.addPartSupplyItem(item);

      expect(prisma.quotePartSupply.create).toHaveBeenCalledWith({
        data: { quoteId, partSupplyId, quantity: 4, unitPrice: 5, totalPrice: 20 },
      });
    });

    it('should delete a part supply item', async () => {
      await repository.removePartSupplyItem(quoteId, partSupplyId);

      expect(prisma.quotePartSupply.delete).toHaveBeenCalledWith({
        where: { quoteId_partSupplyId: { quoteId, partSupplyId } },
      });
    });

    it('should update the quantity of a part supply item', async () => {
      await repository.updatePartSupplyItemQuantity(item);

      expect(prisma.quotePartSupply.update).toHaveBeenCalledWith({
        where: { quoteId_partSupplyId: { quoteId, partSupplyId } },
        data: { quantity: 4, totalPrice: 20, updatedAt: item.updatedAt },
      });
    });
  });

  describe('item usage', () => {
    it.each([
      [{ quoteId: randomUUID() }, true],
      [null, false],
    ])('should tell whether a quote uses a service (%o -> %s)', async (row, inUse) => {
      prisma.quoteService.findFirst.mockResolvedValue(row);

      await expect(repository.isServiceInUse(serviceId)).resolves.toBe(inUse);

      expect(prisma.quoteService.findFirst).toHaveBeenCalledWith({
        where: { serviceId },
        select: { createdAt: true },
      });
    });

    it.each([
      [{ quoteId: randomUUID() }, true],
      [null, false],
    ])('should tell whether a quote uses a part supply (%o -> %s)', async (row, inUse) => {
      prisma.quotePartSupply.findFirst.mockResolvedValue(row);

      await expect(repository.isPartSupplyInUse(partSupplyId)).resolves.toBe(inUse);

      expect(prisma.quotePartSupply.findFirst).toHaveBeenCalledWith({
        where: { partSupplyId },
        select: { createdAt: true },
      });
    });
  });
});
