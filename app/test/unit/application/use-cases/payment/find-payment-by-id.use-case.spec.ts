import { randomUUID } from 'node:crypto';

import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { FindPaymentByIdUseCase } from '@application/use-cases/payment/find-payment-by-id.use-case';

import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../../helpers/payment-mock.factory';

describe('FindPaymentByIdUseCase', () => {
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let useCase: FindPaymentByIdUseCase;

  beforeEach(() => {
    paymentRepository = createMockPaymentRepository();

    useCase = new FindPaymentByIdUseCase(paymentRepository);
  });

  it('should return the payment', async () => {
    const payment = createMockPayment();

    paymentRepository.findById.mockResolvedValue(payment);

    await expect(useCase.execute(payment.id)).resolves.toBe(payment);
    expect(paymentRepository.findById).toHaveBeenCalledWith(payment.id);
  });

  it('should raise not found for an unknown payment', async () => {
    const id = randomUUID();

    paymentRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(id)).rejects.toThrow(
      new ResourceNotFoundException('Cobrança', id),
    );
  });
});
