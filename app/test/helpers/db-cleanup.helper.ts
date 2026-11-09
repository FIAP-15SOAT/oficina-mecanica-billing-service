import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.outboxMessage.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.payment.deleteMany();
}
