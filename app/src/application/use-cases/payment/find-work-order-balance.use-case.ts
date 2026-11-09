import { IFindWorkOrderBalanceUseCase } from '@application/ports/input/payment/find-work-order-balance.use-case.interface';
import {
  WorkOrderBalance,
  WorkOrderBalanceReader,
} from '@application/services/work-order-balance-reader';

export class FindWorkOrderBalanceUseCase implements IFindWorkOrderBalanceUseCase {
  constructor(private readonly workOrderBalanceReader: WorkOrderBalanceReader) {}

  execute(workOrderId: string): Promise<WorkOrderBalance> {
    return this.workOrderBalanceReader.read(workOrderId);
  }
}
