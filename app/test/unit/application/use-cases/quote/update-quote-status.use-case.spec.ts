import { randomUUID } from 'node:crypto';

import { UpdateQuoteStatusUseCase } from '@application/use-cases/quote/update-quote-status.use-case';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { IApproveQuoteUseCase } from '@application/ports/input/quote/approve-quote.use-case.interface';
import { IRejectQuoteUseCase } from '@application/ports/input/quote/reject-quote.use-case.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';
import {
  createMockWorkOrderGateway,
  createMockWorkOrderGatewayResponse,
} from '../../../../helpers/work-order-gateway-mock.factory';

describe('UpdateQuoteStatusUseCase', () => {
  const decidedBy = randomUUID();
  let useCase: UpdateQuoteStatusUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;
  let workOrderGateway: jest.Mocked<IWorkOrderGateway>;
  let approveQuoteUseCase: jest.Mocked<IApproveQuoteUseCase>;
  let rejectQuoteUseCase: jest.Mocked<IRejectQuoteUseCase>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();

    workOrderGateway = createMockWorkOrderGateway();
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.AWAITING_APPROVAL }),
    );

    approveQuoteUseCase = { execute: jest.fn() };

    rejectQuoteUseCase = { execute: jest.fn() };

    useCase = new UpdateQuoteStatusUseCase(
      quoteRepository,
      new QuoteWorkOrderPolicy(workOrderGateway),
      approveQuoteUseCase,
      rejectQuoteUseCase,
    );
  });

  it('should check the work order before approving', async () => {
    const quote = createMockQuote({ status: QuoteStatus.SENT });
    const approved = createMockQuote({ id: quote.id, status: QuoteStatus.APPROVED });

    quoteRepository.findById.mockResolvedValue(quote);
    approveQuoteUseCase.execute.mockResolvedValue(approved);

    const result = await useCase.execute(quote.id, decidedBy, { status: QuoteStatus.APPROVED });

    expect(result).toBe(approved);
    expect(workOrderGateway.findById).toHaveBeenCalledWith(quote.workOrderId);
    expect(approveQuoteUseCase.execute).toHaveBeenCalledWith(quote.id, decidedBy);
  });

  it('should refuse approval with 409 when the work order is not AWAITING_APPROVAL', async () => {
    quoteRepository.findById.mockResolvedValue(createMockQuote({ status: QuoteStatus.SENT }));
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.IN_DIAGNOSIS }),
    );

    await expect(
      useCase.execute('quote-id', decidedBy, { status: QuoteStatus.APPROVED }),
    ).rejects.toThrow(
      new ResourceConflictException(
        'Transição de status não permitida: de IN_DIAGNOSIS para APPROVED',
      ),
    );

    expect(approveQuoteUseCase.execute).not.toHaveBeenCalled();
  });

  it('should throw not found before reading the work order for an unknown quote', async () => {
    quoteRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('unknown-id', decidedBy, { status: QuoteStatus.APPROVED }),
    ).rejects.toThrow(new ResourceNotFoundException('Orçamento', 'unknown-id'));

    expect(workOrderGateway.findById).not.toHaveBeenCalled();
  });

  it('should reject without reading the work order', async () => {
    const rejected = createMockQuote({ status: QuoteStatus.REJECTED });

    rejectQuoteUseCase.execute.mockResolvedValue(rejected);

    const result = await useCase.execute('quote-id', decidedBy, {
      status: QuoteStatus.REJECTED,
      reason: 'Preço elevado',
    });

    expect(result).toBe(rejected);
    expect(rejectQuoteUseCase.execute).toHaveBeenCalledWith('quote-id', 'Preço elevado', decidedBy);
    expect(quoteRepository.findById).not.toHaveBeenCalled();
    expect(workOrderGateway.findById).not.toHaveBeenCalled();
  });
});
