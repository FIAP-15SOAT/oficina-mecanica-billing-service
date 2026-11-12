import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import { BUSINESS_EVENTS } from '@application/logging/business-event.catalog';
import { IFindExistingWorkOrdersUseCase } from '@application/ports/input/quote/find-existing-work-orders.use-case.interface';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { WorkOrderGatewayResponse } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { ILogger } from '@application/ports/output/services/logger.service.interface';

const NOT_FOUND_STATUS = 404;

export class FindExistingWorkOrdersUseCase implements IFindExistingWorkOrdersUseCase {
  constructor(
    private readonly workOrderGateway: IWorkOrderGateway,
    private readonly logger: ILogger,
  ) {}

  async execute(workOrderIds: readonly string[]): Promise<WorkOrderGatewayResponse[]> {
    const workOrders = await Promise.all(
      [...new Set(workOrderIds)].map((workOrderId) => this.findExisting(workOrderId)),
    );

    return workOrders.filter((workOrder) => workOrder !== null);
  }

  // An initial quote can outlive a work order that was never written, and it must not take the page down.
  private async findExisting(workOrderId: string): Promise<WorkOrderGatewayResponse | null> {
    try {
      return await this.workOrderGateway.findById(workOrderId);
    } catch (error) {
      if (
        !(error instanceof ServiceRequestRejectedException) ||
        error.statusCode !== NOT_FOUND_STATUS
      ) {
        throw error;
      }

      this.logger.event(BUSINESS_EVENTS.QUOTE_WORK_ORDER_MISSING, { workOrderId });

      return null;
    }
  }
}
