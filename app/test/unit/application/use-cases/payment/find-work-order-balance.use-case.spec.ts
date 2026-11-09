import { randomUUID } from 'node:crypto';

import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { WorkOrderBalanceReader } from '@application/services/work-order-balance-reader';
import { FindWorkOrderBalanceUseCase } from '@application/use-cases/payment/find-work-order-balance.use-case';

import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../../helpers/payment-mock.factory';
import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';

describe('FindWorkOrderBalanceUseCase', () => {
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let useCase: FindWorkOrderBalanceUseCase;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();

    paymentRepository = createMockPaymentRepository();

    useCase = new FindWorkOrderBalanceUseCase(
      new WorkOrderBalanceReader(quoteRepository, paymentRepository),
    );
  });

  it('should read the balance after the down payment', async () => {
    const workOrderId = randomUUID();

    quoteRepository.findByWorkOrderId.mockResolvedValue([
      createMockQuote({ workOrderId, status: QuoteStatus.APPROVED, totalAmount: 500 }),
    ]);

    paymentRepository.findByWorkOrderId.mockResolvedValue([
      createMockPayment({ workOrderId, amount: 100, status: PaymentStatus.APPROVED }),
    ]);

    await expect(useCase.execute(workOrderId)).resolves.toEqual({
      approvedTotal: 500,
      paidTotal: 100,
      balance: 400,
      hasPendingPayment: false,
    });

    expect(quoteRepository.findByWorkOrderId).toHaveBeenCalledWith(workOrderId);
    expect(paymentRepository.findByWorkOrderId).toHaveBeenCalledWith(workOrderId);
  });
});
