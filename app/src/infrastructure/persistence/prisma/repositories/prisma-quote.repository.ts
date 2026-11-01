import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/client';

import { PrismaService } from '../prisma.service';

import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';
import { QuoteMapper } from '@infrastructure/persistence/prisma/mappers/quote.mapper';
import { paginate } from '@infrastructure/persistence/prisma/helpers/prisma-paginate.helper';
import { existsBy } from '@infrastructure/persistence/prisma/helpers/prisma-exists.helper';

import { Quote } from '@domain/entities/quote.entity';
import { QuoteService } from '@domain/entities/quote-service.entity';
import { QuotePartSupply } from '@domain/entities/quote-part-supply.entity';
import {
  IQuoteRepository,
  QuoteFilters,
} from '@domain/interfaces/repositories/quote.repository.interface';
import {
  PaginatedRepositoryResult,
  PaginationInput,
} from '@domain/interfaces/common/pagination.interface';

const QUOTE_ITEMS_INCLUDE = { services: true, partsSupplies: true } as const;

// Another request changed the same row first: a duplicate item insert (P2002), a stale version or
// an item already gone (P2025).
const CONCURRENT_CHANGE_CODES = new Set(['P2002', 'P2025']);

@Injectable()
export class PrismaQuoteRepository implements IQuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(quote: Quote): Promise<Quote> {
    const record = await this.prisma.quote.create({
      data: {
        id: quote.id,
        workOrderId: quote.workOrderId,
        servicesAmount: quote.servicesAmount,
        partsAmount: quote.partsAmount,
        totalAmount: quote.totalAmount,
        version: quote.version,
        status: quote.status,
        notes: quote.notes,
        sentAt: quote.sentAt,
        approvedAt: quote.approvedAt,
        rejectedAt: quote.rejectedAt,
        services: {
          create: quote.services.map((s) => ({
            serviceId: s.serviceId,
            quantity: s.quantity,
            unitPrice: s.unitPrice,
            totalPrice: s.totalPrice,
          })),
        },
        partsSupplies: {
          create: quote.partsSupplies.map((p) => ({
            partSupplyId: p.partSupplyId,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            totalPrice: p.totalPrice,
          })),
        },
      },
      include: QUOTE_ITEMS_INCLUDE,
    });

    return QuoteMapper.toDomain(record);
  }

  async findById(id: string): Promise<Quote | null> {
    const record = await this.prisma.quote.findUnique({ where: { id } });
    return record ? QuoteMapper.toDomain(record) : null;
  }

  async findByIdWithDetails(id: string): Promise<Quote | null> {
    const record = await this.prisma.quote.findUnique({
      where: { id },
      include: QUOTE_ITEMS_INCLUDE,
    });
    return record ? QuoteMapper.toDomain(record) : null;
  }

  async findByWorkOrderId(workOrderId: string): Promise<Quote[]> {
    const records = await this.prisma.quote.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => QuoteMapper.toDomain(r));
  }

  async findAllPaginated(
    pagination: PaginationInput,
    filters: QuoteFilters,
  ): Promise<PaginatedRepositoryResult<Quote>> {
    const { workOrderId, status } = filters;

    const where: Prisma.QuoteWhereInput = {};

    if (workOrderId) where.workOrderId = workOrderId;
    if (status) where.status = status;

    const result = await paginate(
      this.prisma.quote,
      { where, orderBy: { createdAt: 'desc' } },
      pagination,
    );

    return {
      items: result.items.map((r) => QuoteMapper.toDomain(r)),
      total: result.total,
    };
  }

  async update(quote: Quote): Promise<Quote> {
    const record = await this.guardConcurrentChange(() =>
      this.prisma.quote.update({
        where: { id: quote.id, version: quote.version },
        data: {
          servicesAmount: quote.servicesAmount,
          partsAmount: quote.partsAmount,
          totalAmount: quote.totalAmount,
          status: quote.status,
          notes: quote.notes,
          sentAt: quote.sentAt,
          approvedAt: quote.approvedAt,
          rejectedAt: quote.rejectedAt,
          replacedByQuoteId: quote.replacedByQuoteId,
          rejectionReason: quote.rejectionReason,
          decidedBy: quote.decidedBy,
          updatedAt: quote.updatedAt,
          version: { increment: 1 },
        },
        include: QUOTE_ITEMS_INCLUDE,
      }),
    );

    return QuoteMapper.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.quote.delete({ where: { id } });
  }

  async addServiceItem(item: QuoteService): Promise<void> {
    await this.guardConcurrentChange(() =>
      this.prisma.quoteService.create({
        data: {
          quoteId: item.quoteId,
          serviceId: item.serviceId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        },
      }),
    );
  }

  async removeServiceItem(quoteId: string, serviceId: string): Promise<void> {
    await this.guardConcurrentChange(() =>
      this.prisma.quoteService.delete({
        where: { quoteId_serviceId: { quoteId, serviceId } },
      }),
    );
  }

  async updateServiceItemQuantity(item: QuoteService): Promise<void> {
    await this.guardConcurrentChange(() =>
      this.prisma.quoteService.update({
        where: { quoteId_serviceId: { quoteId: item.quoteId, serviceId: item.serviceId } },
        data: {
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          updatedAt: item.updatedAt,
        },
      }),
    );
  }

  async addPartSupplyItem(item: QuotePartSupply): Promise<void> {
    await this.guardConcurrentChange(() =>
      this.prisma.quotePartSupply.create({
        data: {
          quoteId: item.quoteId,
          partSupplyId: item.partSupplyId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        },
      }),
    );
  }

  async removePartSupplyItem(quoteId: string, partSupplyId: string): Promise<void> {
    await this.guardConcurrentChange(() =>
      this.prisma.quotePartSupply.delete({
        where: { quoteId_partSupplyId: { quoteId, partSupplyId } },
      }),
    );
  }

  async updatePartSupplyItemQuantity(item: QuotePartSupply): Promise<void> {
    await this.guardConcurrentChange(() =>
      this.prisma.quotePartSupply.update({
        where: {
          quoteId_partSupplyId: { quoteId: item.quoteId, partSupplyId: item.partSupplyId },
        },
        data: {
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          updatedAt: item.updatedAt,
        },
      }),
    );
  }

  async isServiceInUse(serviceId: string): Promise<boolean> {
    return existsBy(this.prisma.quoteService, { serviceId });
  }

  async isPartSupplyInUse(partSupplyId: string): Promise<boolean> {
    return existsBy(this.prisma.quotePartSupply, { partSupplyId });
  }

  private async guardConcurrentChange<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        CONCURRENT_CHANGE_CODES.has(error.code)
      ) {
        throw new ConcurrencyException(
          'Orçamento foi modificado por outra operação. Tente novamente',
        );
      }
      throw error;
    }
  }
}
