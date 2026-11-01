import { FindWorkOrdersByIdsUseCase } from '@application/use-cases/quote/find-work-orders-by-ids.use-case';

import {
  createMockWorkOrderGateway,
  createMockWorkOrderGatewayResponse,
} from '../../../../helpers/work-order-gateway-mock.factory';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';

describe('FindWorkOrdersByIdsUseCase', () => {
  let useCase: FindWorkOrdersByIdsUseCase;
  let workOrderGateway: jest.Mocked<IWorkOrderGateway>;

  beforeEach(() => {
    workOrderGateway = createMockWorkOrderGateway();
    useCase = new FindWorkOrdersByIdsUseCase(workOrderGateway);
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
  });
});
