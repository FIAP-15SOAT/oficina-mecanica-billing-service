import { Global, Module } from '@nestjs/common';

import { PrismaPaymentRepository } from './prisma-payment.repository';
import { PrismaQuoteRepository } from './prisma-quote.repository';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

const REPOSITORY_PROVIDERS = [
  { provide: 'IUnitOfWork', useClass: PrismaUnitOfWork },
  { provide: 'IQuoteRepository', useClass: PrismaQuoteRepository },
  { provide: 'IPaymentRepository', useClass: PrismaPaymentRepository },
];

@Global()
@Module({
  providers: REPOSITORY_PROVIDERS,
  exports: REPOSITORY_PROVIDERS,
})
export class RepositoriesModule {}
