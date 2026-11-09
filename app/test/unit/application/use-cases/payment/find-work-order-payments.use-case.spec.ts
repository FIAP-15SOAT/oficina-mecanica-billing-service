import { randomUUID } from 'node:crypto';

import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { IPaymentRepository } from '@domain/interfaces/repositories/payment.repository.interface';

import { FindWorkOrderPaymentsUseCase } from '@application/use-cases/payment/find-work-order-payments.use-case';

import {
  createMockPayment,
  createMockPaymentRepository,
} from '../../../../helpers/payment-mock.factory';

describe('FindWorkOrderPaymentsUseCase', () => {
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let useCase: FindWorkOrderPaymentsUseCase;

  beforeEach(() => {
    paymentRepository = createMockPaymentRepository();

    useCase = new FindWorkOrderPaymentsUseCase(paymentRepository);
  });

  it('should list the work order payments', async () => {
    const workOrderId = randomUUID();

    const payments = [
      createMockPayment({ workOrderId, status: PaymentStatus.APPROVED }),
      createMockPayment({ workOrderId }),
    ];

    paymentRepository.findByWorkOrderId.mockResolvedValue(payments);

    await expect(useCase.execute(workOrderId)).resolves.toBe(payments);
    expect(paymentRepository.findByWorkOrderId).toHaveBeenCalledWith(workOrderId);
  });
});
