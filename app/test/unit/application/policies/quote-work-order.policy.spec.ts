import { QuoteWorkOrderPolicy } from '@application/policies/quote-work-order.policy';
import { ResourceConflictException } from '@application/exceptions/resource-conflict.exception';
import { ServiceRequestRejectedException } from '@application/exceptions/service-request-rejected.exception';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';

import { createMockQuote } from '../../../helpers/quote-mock.factory';
import {
  createMockWorkOrderGateway,
  createMockWorkOrderGatewayResponse,
} from '../../../helpers/work-order-gateway-mock.factory';
import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';

describe('QuoteWorkOrderPolicy', () => {
  const workOrderId = '6f1c2b9e-4d3a-4e8b-9c7d-2a1b3c4d5e6f';

  let policy: QuoteWorkOrderPolicy;
  let workOrderGateway: jest.Mocked<IWorkOrderGateway>;

  beforeEach(() => {
    workOrderGateway = createMockWorkOrderGateway();
    policy = new QuoteWorkOrderPolicy(workOrderGateway);
  });

  it.each([
    WorkOrderStatus.IN_DIAGNOSIS,
    WorkOrderStatus.AWAITING_APPROVAL,
    WorkOrderStatus.REJECTED,
  ])('should accept creation and submission for a %s work order', async (status) => {
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: status }),
    );

    await expect(policy.ensureCanCreateQuote(workOrderId)).resolves.toBeUndefined();
    await expect(policy.ensureCanSubmitQuote(workOrderId)).resolves.toBeUndefined();
    expect(workOrderGateway.findById).toHaveBeenCalledWith(workOrderId);
  });

  it('should refuse creation for a RECEIVED work order naming the allowed statuses', async () => {
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.RECEIVED }),
    );

    await expect(policy.ensureCanCreateQuote(workOrderId)).rejects.toThrow(
      new ResourceConflictException(
        'Orçamento só pode ser criado com a Ordem de Serviço em um dos seguintes status: IN_DIAGNOSIS, AWAITING_APPROVAL ou REJECTED. Status atual: "RECEIVED"',
      ),
    );
  });

  it('should refuse submission for a RECEIVED work order naming the allowed statuses', async () => {
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.RECEIVED }),
    );

    await expect(policy.ensureCanSubmitQuote(workOrderId)).rejects.toThrow(
      new ResourceConflictException(
        'Orçamento só pode ser enviado com a Ordem de Serviço em um dos seguintes status: IN_DIAGNOSIS, AWAITING_APPROVAL ou REJECTED. Status atual: "RECEIVED"',
      ),
    );
  });

  it('should accept approval when the work order is AWAITING_APPROVAL', async () => {
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.AWAITING_APPROVAL }),
    );

    await expect(policy.ensureAwaitingApproval(workOrderId)).resolves.toBeUndefined();
  });

  it('should refuse approval when the work order is not AWAITING_APPROVAL', async () => {
    workOrderGateway.findById.mockResolvedValue(
      createMockWorkOrderGatewayResponse({ status: WorkOrderStatus.IN_DIAGNOSIS }),
    );

    await expect(policy.ensureAwaitingApproval(workOrderId)).rejects.toThrow(
      new ResourceConflictException(
        'Transição de status não permitida: de IN_DIAGNOSIS para APPROVED',
      ),
    );
  });

  it('should propagate the work order 404', async () => {
    const notFound = new ServiceRequestRejectedException(404, 'Ordem de Serviço não encontrado(a)');
    workOrderGateway.findById.mockRejectedValue(notFound);

    await expect(policy.ensureCanCreateQuote(workOrderId)).rejects.toBe(notFound);
  });

  it('should propagate the work order unavailability as 503', async () => {
    const unavailable = new ServiceIntegrationException('Serviço de destino indisponível.');
    workOrderGateway.findById.mockRejectedValue(unavailable);

    await expect(policy.ensureCanSubmitQuote(workOrderId)).rejects.toBe(unavailable);
  });

  describe('ensureNoApprovedQuote', () => {
    it('should refuse when another quote of the work order is APPROVED', () => {
      const quotes = [
        createMockQuote({ status: QuoteStatus.SENT }),
        createMockQuote({ status: QuoteStatus.APPROVED }),
      ];

      expect(() => policy.ensureNoApprovedQuote(quotes)).toThrow(
        new ResourceConflictException('A ordem de serviço já tem um orçamento aprovado'),
      );
    });

    it('should accept when no quote is APPROVED', () => {
      const quotes = [
        createMockQuote({ status: QuoteStatus.PENDING }),
        createMockQuote({ status: QuoteStatus.REJECTED }),
      ];

      expect(() => policy.ensureNoApprovedQuote(quotes)).not.toThrow();
      expect(workOrderGateway.findById).not.toHaveBeenCalled();
    });
  });
});
