import { WorkOrderGatewayResponse } from './work-order-gateway.response';

export interface IWorkOrderGateway {
  findById(id: string): Promise<WorkOrderGatewayResponse>;
}
