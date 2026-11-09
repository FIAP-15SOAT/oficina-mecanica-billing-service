import { WorkOrderBalance } from '@application/services/work-order-balance-reader';

export interface IFindWorkOrderBalanceUseCase {
  execute(workOrderId: string): Promise<WorkOrderBalance>;
}
