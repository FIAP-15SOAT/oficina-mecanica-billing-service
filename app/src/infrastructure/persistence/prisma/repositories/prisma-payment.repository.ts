import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/client';

import { PrismaService } from '../prisma.service';

import { ConcurrencyException } from '@infrastructure/exceptions/concurrency.exception';
import { PaymentMapper } from '@infrastructure/persistence/prisma/mappers/payment.mapper';
import { paginate } from '@infrastructure/persistence/prisma/helpers/prisma-paginate.helper';

import { Payment } from '@domain/entities/payment.entity';
import {
  IPaymentRepository,
  PaymentFilters,
} from '@domain/interfaces/repositories/payment.repository.interface';
import {
  PaginatedRepositoryResult,
  PaginationInput,
} from '@domain/interfaces/common/pagination.interface';

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(payment: Payment): Promise<Payment> {
    // The partial unique index keeps one PENDING payment per work order under concurrent creation.
    const record = await this.guardConcurrentChange(
      'P2002',
      'A ordem de serviço já tem uma cobrança pendente',
      () =>
        this.prisma.payment.create({
          data: {
            id: payment.id,
            workOrderId: payment.workOrderId,
            amount: payment.amount,
            status: payment.status,
            checkoutId: payment.checkoutId,
            checkoutUrl: payment.checkoutUrl,
            expiresAt: payment.expiresAt,
            version: payment.version,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt,
          },
        }),
    );

    return PaymentMapper.toDomain(record);
  }

  async findById(id: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { id } });

    return record ? PaymentMapper.toDomain(record) : null;
  }

  async findByCheckoutId(checkoutId: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { checkoutId } });

    return record ? PaymentMapper.toDomain(record) : null;
  }

  async findByWorkOrderId(workOrderId: string): Promise<Payment[]> {
    const records = await this.prisma.payment.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((r) => PaymentMapper.toDomain(r));
  }

  async findAllPaginated(
    pagination: PaginationInput,
    filters: PaymentFilters,
  ): Promise<PaginatedRepositoryResult<Payment>> {
    const { workOrderId, status } = filters;

    const result = await paginate(
      this.prisma.payment,
      { where: { workOrderId, status }, orderBy: { createdAt: 'desc' } },
      pagination,
    );

    return {
      items: result.items.map((r) => PaymentMapper.toDomain(r)),
      total: result.total,
    };
  }

  async update(payment: Payment): Promise<Payment> {
    const record = await this.guardConcurrentChange(
      'P2025',
      'A cobrança foi alterada por outra operação. Tente novamente',
      () =>
        this.prisma.payment.update({
          where: { id: payment.id, version: payment.version },
          data: {
            status: payment.status,
            updatedAt: payment.updatedAt,
            version: { increment: 1 },
          },
        }),
    );

    return PaymentMapper.toDomain(record);
  }

  private async guardConcurrentChange<T>(
    code: string,
    message: string,
    write: () => Promise<T>,
  ): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === code) {
        throw new ConcurrencyException(message);
      }

      throw error;
    }
  }
}
