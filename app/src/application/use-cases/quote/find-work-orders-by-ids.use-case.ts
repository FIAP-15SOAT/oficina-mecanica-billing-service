import { IFindWorkOrdersByIdsUseCase } from '@application/ports/input/quote/find-work-orders-by-ids.use-case.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { WorkOrderGatewayResponse } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

export class FindWorkOrdersByIdsUseCase implements IFindWorkOrdersByIdsUseCase {
  constructor(private readonly workOrderGateway: IWorkOrderGateway) {}

  execute(workOrderIds: readonly string[]): Promise<WorkOrderGatewayResponse[]> {
    return Promise.all(
      [...new Set(workOrderIds)].map((workOrderId) => this.workOrderGateway.findById(workOrderId)),
    );
  }
}
