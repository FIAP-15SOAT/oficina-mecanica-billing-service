import { randomUUID } from 'node:crypto';

import { InternalQuoteController } from '@infrastructure/http/controllers/internal/internal-quote.controller';
import { InternalQuoteController as InternalQuoteCleanController } from '@interface-adapters/quote/internal-quote.controller';
import { QuotePresenter } from '@interface-adapters/quote/quote.presenter';
import { QuoteDecisionAction } from '@domain/enums/quote-decision-action.enum';

import { createMockQuote } from '../../../../../helpers/quote-mock.factory';

describe('InternalQuoteController (http)', () => {
  const quote = createMockQuote();
  const catalog = { services: [], partsSupplies: [] };
  let cleanController: InternalQuoteCleanController;
  let httpController: InternalQuoteController;

  beforeEach(() => {
    cleanController = new InternalQuoteCleanController(
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
    );

    httpController = new InternalQuoteController(cleanController);
  });

  it('should delegate the initial quote creation', async () => {
    const response = QuotePresenter.toInternalDataResponse(quote);
    const input = { workOrderId: quote.workOrderId };

    jest.spyOn(cleanController, 'createInitial').mockResolvedValue(response);

    await expect(httpController.createInitial(input)).resolves.toBe(response);
    expect(cleanController.createInitial).toHaveBeenCalledWith(input);
  });

  it('should delegate the deletion', async () => {
    jest.spyOn(cleanController, 'delete').mockResolvedValue(undefined);

    await expect(httpController.delete(quote.id)).resolves.toBeUndefined();
    expect(cleanController.delete).toHaveBeenCalledWith(quote.id);
  });

  it('should delegate the detail', async () => {
    const response = QuotePresenter.toInternalWithItemsResponse(quote, catalog);

    jest.spyOn(cleanController, 'findOne').mockResolvedValue(response);

    await expect(httpController.findOne(quote.id)).resolves.toBe(response);
    expect(cleanController.findOne).toHaveBeenCalledWith(quote.id);
  });

  it('should delegate the work order quotes listing', async () => {
    const response = QuotePresenter.toInternalListResponse([quote]);

    jest.spyOn(cleanController, 'findWorkOrderQuotes').mockResolvedValue(response);

    await expect(httpController.findWorkOrderQuotes(quote.workOrderId)).resolves.toBe(response);
    expect(cleanController.findWorkOrderQuotes).toHaveBeenCalledWith(quote.workOrderId);
  });

  it('should delegate the decision', async () => {
    const response = QuotePresenter.toInternalWithItemsResponse(quote, catalog);
    const input = { action: QuoteDecisionAction.REJECT, reason: 'Caro', decidedBy: randomUUID() };

    jest.spyOn(cleanController, 'decide').mockResolvedValue(response);

    await expect(httpController.decide(quote.id, input)).resolves.toBe(response);
    expect(cleanController.decide).toHaveBeenCalledWith(quote.id, input);
  });
});
