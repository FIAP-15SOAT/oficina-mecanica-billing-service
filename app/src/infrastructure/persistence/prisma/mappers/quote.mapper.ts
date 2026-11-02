import type {
  Quote as PrismaQuote,
  QuoteService as PrismaQuoteService,
  QuotePartSupply as PrismaQuotePartSupply,
} from '@generated/client';
import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { QuoteServiceMapper } from './quote-service.mapper';
import { QuotePartSupplyMapper } from './quote-part-supply.mapper';

export type PrismaQuoteWithItems = PrismaQuote & {
  services?: PrismaQuoteService[];
  partsSupplies?: PrismaQuotePartSupply[];
};

export class QuoteMapper {
  static toDomain(record: PrismaQuoteWithItems): Quote {
    return Quote.reconstitute({
      id: record.id,
      workOrderId: record.workOrderId,
      servicesAmount: Number(record.servicesAmount),
      partsAmount: Number(record.partsAmount),
      totalAmount: Number(record.totalAmount),
      version: record.version,
      status: record.status as QuoteStatus,
      notes: record.notes,
      sentAt: record.sentAt,
      approvedAt: record.approvedAt,
      rejectedAt: record.rejectedAt,
      replacedByQuoteId: record.replacedByQuoteId,
      rejectionReason: record.rejectionReason,
      decidedBy: record.decidedBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      services: record.services?.map((s) => QuoteServiceMapper.toDomain(s)),
      partsSupplies: record.partsSupplies?.map((p) => QuotePartSupplyMapper.toDomain(p)),
    });
  }
}
