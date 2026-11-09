import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

export interface WorkOrderBalance {
  approvedTotal: number;
  paidTotal: number;
  balance: number;
  hasPendingPayment: boolean;
}

// Integer cents: 0.3 - 0.1 in floating point is 0.19999999999999998.
const toCents = (value: number): number => Math.round(value * 100);

export class WorkOrderBalanceReader {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async read(workOrderId: string): Promise<WorkOrderBalance> {
    const [quotes, payments] = await Promise.all([
      this.quoteRepository.findByWorkOrderId(workOrderId),
      this.paymentRepository.findByWorkOrderId(workOrderId),
    ]);

    const approvedCents = toCents(
      quotes.find((quote) => quote.status === QuoteStatus.APPROVED)?.totalAmount ?? 0,
    );

    const paidCents = payments
      .filter((payment) => payment.status === PaymentStatus.APPROVED)
      .reduce((total, payment) => total + toCents(payment.amount), 0);

    return {
      approvedTotal: approvedCents / 100,
      paidTotal: paidCents / 100,
      balance: (approvedCents - paidCents) / 100,
      hasPendingPayment: payments.some((payment) => payment.status === PaymentStatus.PENDING),
    };
  }
}
