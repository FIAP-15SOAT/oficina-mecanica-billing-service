import { WorkOrderQuoteController } from '@infrastructure/http/controllers/quote/work-order-quote.controller';
import { QuoteController as QuoteCleanController } from '@interface-adapters/quote/quote.controller';
import { QuotePresenter } from '@interface-adapters/quote/quote.presenter';

import { createMockQuote } from '../../../../../helpers/quote-mock.factory';
import { createMockWorkOrderGatewayResponse } from '../../../../../helpers/work-order-gateway-mock.factory';

describe('WorkOrderQuoteController', () => {
  let cleanController: QuoteCleanController;
  let httpController: WorkOrderQuoteController;

  beforeEach(() => {
    cleanController = new QuoteCleanController(
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
      { execute: jest.fn() },
    );

    httpController = new WorkOrderQuoteController(cleanController);
  });

  it('should delegate the work order quotes listing with the work order id', async () => {
    const workOrder = createMockWorkOrderGatewayResponse();

    const response = QuotePresenter.toListResponse(
      [createMockQuote({ workOrderId: workOrder.id })],
      [workOrder],
    );
    jest.spyOn(cleanController, 'findWorkOrderQuotes').mockResolvedValue(response);

    await expect(httpController.findQuotes(workOrder.id)).resolves.toBe(response);
    expect(cleanController.findWorkOrderQuotes).toHaveBeenCalledWith(workOrder.id);
  });
});
