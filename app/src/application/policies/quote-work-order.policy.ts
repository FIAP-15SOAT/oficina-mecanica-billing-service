import { Quote } from '@domain/entities/quote.entity';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

const QUOTABLE_WORK_ORDER_STATUSES = [
  WorkOrderStatus.IN_DIAGNOSIS,
  WorkOrderStatus.AWAITING_APPROVAL,
  WorkOrderStatus.REJECTED,
];

const QUOTABLE_WORK_ORDER_STATUSES_TEXT = `${QUOTABLE_WORK_ORDER_STATUSES.slice(0, -1).join(', ')} ou ${QUOTABLE_WORK_ORDER_STATUSES.at(-1)}`;

export class QuoteWorkOrderPolicy {
  constructor(private readonly workOrderGateway: IWorkOrderGateway) {}

  async ensureCanCreateQuote(workOrderId: string): Promise<void> {
    const { status } = await this.workOrderGateway.findById(workOrderId);

    if (!QUOTABLE_WORK_ORDER_STATUSES.includes(status)) {
      throw new ResourceConflictException(
        `Orçamento só pode ser criado com a Ordem de Serviço em um dos seguintes status: ${QUOTABLE_WORK_ORDER_STATUSES_TEXT}. Status atual: "${status}"`,
      );
    }
  }

  async ensureCanSubmitQuote(workOrderId: string): Promise<void> {
    const { status } = await this.workOrderGateway.findById(workOrderId);

    if (!QUOTABLE_WORK_ORDER_STATUSES.includes(status)) {
      throw new ResourceConflictException(
        `Orçamento só pode ser enviado com a Ordem de Serviço em um dos seguintes status: ${QUOTABLE_WORK_ORDER_STATUSES_TEXT}. Status atual: "${status}"`,
      );
    }
  }

  async ensureAwaitingApproval(workOrderId: string): Promise<void> {
    const { status } = await this.workOrderGateway.findById(workOrderId);

    if (status !== WorkOrderStatus.AWAITING_APPROVAL) {
      throw new ResourceConflictException(
        `Transição de status não permitida: de ${status} para ${WorkOrderStatus.APPROVED}`,
      );
    }
  }

  ensureNoApprovedQuote(workOrderQuotes: readonly Quote[]): void {
    if (workOrderQuotes.some((quote) => quote.status === QuoteStatus.APPROVED)) {
      throw new ResourceConflictException('A ordem de serviço já tem um orçamento aprovado');
    }
  }
}
