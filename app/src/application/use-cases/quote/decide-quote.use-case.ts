import { Quote } from '@domain/entities/quote.entity';
import { QuoteDecisionAction } from '@domain/enums/quote-decision-action.enum';

import { IApproveQuoteUseCase } from '@application/ports/input/quote/approve-quote.use-case.interface';
import { IDecideQuoteUseCase } from '@application/ports/input/quote/decide-quote.use-case.interface';
import { DecideQuoteDto } from '@application/ports/input/quote/dto/decide-quote.dto';
import { IRejectQuoteUseCase } from '@application/ports/input/quote/reject-quote.use-case.interface';

export class DecideQuoteUseCase implements IDecideQuoteUseCase {
  constructor(
    private readonly approveQuoteUseCase: IApproveQuoteUseCase,
    private readonly rejectQuoteUseCase: IRejectQuoteUseCase,
  ) {}

  execute(quoteId: string, input: DecideQuoteDto): Promise<Quote> {
    return input.action === QuoteDecisionAction.APPROVE
      ? this.approveQuoteUseCase.execute(quoteId, input.decidedBy)
      : this.rejectQuoteUseCase.execute(quoteId, input.reason, input.decidedBy);
  }
}
