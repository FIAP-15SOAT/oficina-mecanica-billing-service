import { randomUUID } from 'node:crypto';

import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { FindAllPaymentsPaginatedUseCase } from '@application/use-cases/payment/find-all-payments-paginated.use-case';

import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../../helpers/payment-mock.factory';

describe('FindAllPaymentsPaginatedUseCase', () => {
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let useCase: FindAllPaymentsPaginatedUseCase;

  beforeEach(() => {
    paymentRepository = createMockPaymentRepository();

    useCase = new FindAllPaymentsPaginatedUseCase(paymentRepository);
  });

  it('should pass pagination and filters to the repository', async () => {
    const workOrderId = randomUUID();
    const payments = [createMockPayment({ workOrderId })];

    paymentRepository.findAllPaginated.mockResolvedValue({ items: payments, total: 6 });

    const result = await useCase.execute({
      page: 2,
      limit: 5,
      workOrderId,
      status: PaymentStatus.PENDING,
    });

    expect(paymentRepository.findAllPaginated).toHaveBeenCalledWith(
      { page: 2, limit: 5 },
      { workOrderId, status: PaymentStatus.PENDING },
    );

    expect(result).toEqual({
      items: payments,
      pagination: { totalRecords: 6, totalPages: 2, page: 2, limit: 5 },
    });
  });
});
