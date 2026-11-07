import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

import { ResourceNotFoundException } from '@application/exceptions/resource-not-found.exception';
import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { IApproveQuoteUseCase } from '@application/ports/input/quote/approve-quote.use-case.interface';
import { IRejectQuoteUseCase } from '@application/ports/input/quote/reject-quote.use-case.interface';
import { IUpdateQuoteStatusUseCase } from '@application/ports/input/quote/update-quote-status.use-case.interface';
import { UpdateQuoteStatusDto } from '@application/ports/input/quote/dto/update-quote-status.dto';

export class UpdateQuoteStatusUseCase implements IUpdateQuoteStatusUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly quoteWorkOrderPolicy: QuoteWorkOrderPolicy,
    private readonly approveQuoteUseCase: IApproveQuoteUseCase,
    private readonly rejectQuoteUseCase: IRejectQuoteUseCase,
  ) {}

  async execute(quoteId: string, decidedBy: string, dto: UpdateQuoteStatusDto): Promise<Quote> {
    if (dto.status === QuoteStatus.REJECTED) {
      return this.rejectQuoteUseCase.execute(quoteId, dto.reason, decidedBy);
    }

    const quote = await this.quoteRepository.findById(quoteId);

    if (!quote) {
      throw new ResourceNotFoundException('Orçamento', quoteId);
    }

    await this.quoteWorkOrderPolicy.ensureAwaitingApproval(quote.workOrderId);

    return this.approveQuoteUseCase.execute(quoteId, decidedBy);
  }
}
