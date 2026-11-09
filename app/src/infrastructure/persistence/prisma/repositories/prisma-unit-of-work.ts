import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/client';

import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';

import { IUnitOfWork, IRepositories } from '@domain/interfaces/repositories/unit-of-work.interface';
import { PrismaOutboxRepository } from './prisma-outbox.repository';
import { PrismaPaymentRepository } from './prisma-payment.repository';
import { PrismaQuoteRepository } from './prisma-quote.repository';

@Injectable()
export class PrismaUnitOfWork implements IUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async executeTransaction<T>(work: (repositories: IRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const repositories: IRepositories = {
        outbox: new PrismaOutboxRepository(tx as unknown as PrismaService),
        quote: new PrismaQuoteRepository(tx as unknown as PrismaService),
        payment: new PrismaPaymentRepository(tx as unknown as PrismaService),
      };

      return work(repositories);
    });
  }
}
