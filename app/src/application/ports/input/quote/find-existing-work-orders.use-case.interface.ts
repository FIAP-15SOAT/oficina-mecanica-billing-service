import { WorkOrderGatewayResponse } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

export interface IFindExistingWorkOrdersUseCase {
  execute(workOrderIds: readonly string[]): Promise<WorkOrderGatewayResponse[]>;
}
