import { FindAllQuotesPaginatedUseCase } from '@application/use-cases/quote/find-all-quotes-paginated.use-case';
import { QuoteStatus } from '@domain/enums/quote-status.enum';

import { createMockQuote } from '../../../../helpers/quote-mock.factory';
import { createMockQuoteRepository } from '../../../../helpers/unit-of-work-mock.factory';
import { IQuoteRepository } from '@domain/interfaces/repositories/quote.repository.interface';

describe('FindAllQuotesPaginatedUseCase', () => {
  let useCase: FindAllQuotesPaginatedUseCase;
  let quoteRepository: jest.Mocked<IQuoteRepository>;

  beforeEach(() => {
    quoteRepository = createMockQuoteRepository();
    useCase = new FindAllQuotesPaginatedUseCase(quoteRepository);
  });

  it('should return the quotes with the pagination metadata', async () => {
    const quotes = [createMockQuote(), createMockQuote({ status: QuoteStatus.SENT })];

    quoteRepository.findAllPaginated.mockResolvedValue({ items: quotes, total: 2 });

    await expect(useCase.execute({ page: 1, limit: 10 })).resolves.toEqual({
      items: quotes,
      pagination: { totalRecords: 2, totalPages: 1, page: 1, limit: 10 },
    });

    expect(quoteRepository.findAllPaginated).toHaveBeenCalledWith({ page: 1, limit: 10 }, {});
  });

  it('should pass the filters to the repository', async () => {
    quoteRepository.findAllPaginated.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({
      workOrderId: 'work-order-id',
      status: QuoteStatus.APPROVED,
      page: 2,
      limit: 5,
    });

    expect(quoteRepository.findAllPaginated).toHaveBeenCalledWith(
      { page: 2, limit: 5 },
      { workOrderId: 'work-order-id', status: QuoteStatus.APPROVED },
    );
  });
});
