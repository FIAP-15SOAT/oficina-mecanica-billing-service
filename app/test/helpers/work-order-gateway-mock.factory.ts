import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { IWorkOrderGateway } from '@application/ports/output/gateways/work-order/work-order-gateway.interface';
import {
  WorkOrderGatewayResponse,
  WorkOrderStatus,
} from '@application/ports/output/gateways/work-order/work-order-gateway.response';

export interface InternalWorkOrderFixture {
  data: WorkOrderGatewayResponse;
}

export function readInternalWorkOrderFixture(): InternalWorkOrderFixture {
  return JSON.parse(
    readFileSync(join(__dirname, '../contracts/work-order/internal-work-order.json'), 'utf8'),
  ) as InternalWorkOrderFixture;
}

export function createMockWorkOrderGateway(): jest.Mocked<IWorkOrderGateway> {
  return { findById: jest.fn() };
}

export function createMockWorkOrderGatewayResponse(
  overrides: Partial<WorkOrderGatewayResponse> = {},
): WorkOrderGatewayResponse {
  return {
    ...readInternalWorkOrderFixture().data,
    id: randomUUID(),
    status: WorkOrderStatus.IN_DIAGNOSIS,
    ...overrides,
  };
}
