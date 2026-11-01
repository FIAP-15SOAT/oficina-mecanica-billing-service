import { randomUUID } from 'node:crypto';

import { DecideQuoteUseCase } from '@application/use-cases/quote/decide-quote.use-case';
import { IApproveQuoteUseCase } from '@application/ports/input/quote/approve-quote.use-case.interface';
import { IRejectQuoteUseCase } from '@application/ports/input/quote/reject-quote.use-case.interface';
import { QuoteDecisionAction } from '@domain/enums/quote-decision-action.enum';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

import { createMockQuote } from '../../../../helpers/quote-mock.factory';

describe('DecideQuoteUseCase', () => {
  const decidedBy = randomUUID();
  let useCase: DecideQuoteUseCase;
  let approveQuoteUseCase: jest.Mocked<IApproveQuoteUseCase>;
  let rejectQuoteUseCase: jest.Mocked<IRejectQuoteUseCase>;

  beforeEach(() => {
    approveQuoteUseCase = { execute: jest.fn() };

    rejectQuoteUseCase = { execute: jest.fn() };

    useCase = new DecideQuoteUseCase(approveQuoteUseCase, rejectQuoteUseCase);
  });

  it('should route the approve decision with the author', async () => {
    const approved = createMockQuote({ status: QuoteStatus.APPROVED });

    approveQuoteUseCase.execute.mockResolvedValue(approved);

    const result = await useCase.execute('quote-id', {
      action: QuoteDecisionAction.APPROVE,
      decidedBy,
    });

    expect(result).toBe(approved);
    expect(approveQuoteUseCase.execute).toHaveBeenCalledWith('quote-id', decidedBy);
    expect(rejectQuoteUseCase.execute).not.toHaveBeenCalled();
  });

  it('should route the reject decision with the reason and the author', async () => {
    const rejected = createMockQuote({ status: QuoteStatus.REJECTED });

    rejectQuoteUseCase.execute.mockResolvedValue(rejected);

    const result = await useCase.execute('quote-id', {
      action: QuoteDecisionAction.REJECT,
      reason: 'Preço elevado',
      decidedBy,
    });

    expect(result).toBe(rejected);
    expect(rejectQuoteUseCase.execute).toHaveBeenCalledWith('quote-id', 'Preço elevado', decidedBy);
    expect(approveQuoteUseCase.execute).not.toHaveBeenCalled();
  });
});
