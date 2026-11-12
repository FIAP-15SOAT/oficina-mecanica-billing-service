import { FindExistingWorkOrdersUseCase } from '@application/use-cases/quote/find-existing-work-orders.use-case';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';

import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import {
  createMockWorkOrderGateway,
  createMockWorkOrderGatewayResponse,
} from '../../../../helpers/work-order-gateway-mock.factory';

describe('FindExistingWorkOrdersUseCase', () => {
  let useCase: FindExistingWorkOrdersUseCase;
  let workOrderGateway: jest.Mocked<IWorkOrderGateway>;
  let logger: jest.Mocked<ILogger>;

  beforeEach(() => {
    workOrderGateway = createMockWorkOrderGateway();

    logger = createMockLogger();

    useCase = new FindExistingWorkOrdersUseCase(workOrderGateway, logger);
  });

  it('should read each distinct work order once, in parallel', async () => {
    const first = createMockWorkOrderGatewayResponse();
    const second = createMockWorkOrderGatewayResponse();

    workOrderGateway.findById.mockImplementation((id) =>
      Promise.resolve(id === first.id ? first : second),
    );

    await expect(useCase.execute([first.id, second.id, first.id])).resolves.toEqual([
      first,
      second,
    ]);

    expect(workOrderGateway.findById).toHaveBeenCalledTimes(2);
    expect(logger.event).not.toHaveBeenCalled();
  });

  it('should leave out and log a work order the work order service does not know', async () => {
    const known = createMockWorkOrderGatewayResponse();
    const unknownId = createMockWorkOrderGatewayResponse().id;

    workOrderGateway.findById.mockImplementation((id) =>
      id === known.id
        ? Promise.resolve(known)
        : Promise.reject(
            new ServiceRequestRejectedException(404, 'Ordem de Serviço não encontrada'),
          ),
    );

    await expect(useCase.execute([unknownId, known.id])).resolves.toEqual([known]);

    expect(logger.event).toHaveBeenCalledWith(BUSINESS_EVENTS.QUOTE_WORK_ORDER_MISSING, {
      workOrderId: unknownId,
    });
  });

  it.each([
    ['another owner rejection', new ServiceRequestRejectedException(400, 'Requisição inválida')],
    ['an unavailable owner', new ServiceIntegrationException('Serviço indisponível')],
  ])('should let %s through', async (_label, error) => {
    workOrderGateway.findById.mockRejectedValue(error);

    await expect(useCase.execute([createMockWorkOrderGatewayResponse().id])).rejects.toBe(error);

    expect(logger.event).not.toHaveBeenCalled();
  });
});
