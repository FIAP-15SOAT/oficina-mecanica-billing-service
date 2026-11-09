import { randomUUID } from 'node:crypto';

import { WorkOrderBalanceReader } from '@application/services/work-order-balance-reader';
import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../helpers/payment-mock.factory';
import { createMockQuote } from '../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../helpers/unit-of-work-mock.factory';

describe('WorkOrderBalanceReader', () => {
  const workOrderId = randomUUID();

  let reader: WorkOrderBalanceReader;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let paymentRepository: jest.Mocked<IPaymentRepository>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();
    quoteRepository.findByWorkOrderId.mockResolvedValue([]);

    paymentRepository = createMockPaymentRepository();
    paymentRepository.findByWorkOrderId.mockResolvedValue([]);

    reader = new WorkOrderBalanceReader(quoteRepository, paymentRepository);
  });

  it('should compute the balance from the approved quote and the approved payments', async () => {
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      createMockQuote({ workOrderId, status: QuoteStatus.REJECTED, totalAmount: 900 }),
      createMockQuote({ workOrderId, status: QuoteStatus.APPROVED, totalAmount: 500 }),
    ]);

    paymentRepository.findByWorkOrderId.mockResolvedValue([
      createMockPayment({ workOrderId, amount: 100, status: PaymentStatus.APPROVED }),
      createMockPayment({ workOrderId, amount: 50, status: PaymentStatus.EXPIRED }),
    ]);

    const balance = await reader.read(workOrderId);

    expect(balance).toEqual({
      approvedTotal: 500,
      paidTotal: 100,
      balance: 400,
      hasPendingPayment: false,
    });

    expect(quoteRepository.findByWorkOrderId).toHaveBeenCalledWith(workOrderId);
    expect(paymentRepository.findByWorkOrderId).toHaveBeenCalledWith(workOrderId);
  });

  it('should subtract in cents', async () => {
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      createMockQuote({ workOrderId, status: QuoteStatus.APPROVED, totalAmount: 0.3 }),
    ]);

    paymentRepository.findByWorkOrderId.mockResolvedValue([
      createMockPayment({ workOrderId, amount: 0.1, status: PaymentStatus.APPROVED }),
    ]);

    const { balance } = await reader.read(workOrderId);

    expect(balance).toBe(0.2);
    expect(balance.toFixed(2)).toBe('0.20');
  });

  it('should answer a zero balance without an approved quote', async () => {
    quoteRepository.findByWorkOrderId.mockResolvedValue([
      createMockQuote({ workOrderId, status: QuoteStatus.SENT, totalAmount: 500 }),
    ]);

    const balance = await reader.read(workOrderId);

    expect(balance).toEqual({
      approvedTotal: 0,
      paidTotal: 0,
      balance: 0,
      hasPendingPayment: false,
    });
  });

  it('should report a pending payment', async () => {
    paymentRepository.findByWorkOrderId.mockResolvedValue([
      createMockPayment({ workOrderId, status: PaymentStatus.PENDING }),
    ]);

    const { hasPendingPayment, paidTotal } = await reader.read(workOrderId);

    expect(hasPendingPayment).toBe(true);
    expect(paidTotal).toBe(0);
  });
});
