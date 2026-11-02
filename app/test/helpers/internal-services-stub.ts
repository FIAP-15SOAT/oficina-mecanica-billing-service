import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

import {
  readInternalPartSupplyFixture,
  readInternalServiceFixture,
} from './inventory-catalog-gateway-mock.factory';
import { readInternalWorkOrderFixture } from './work-order-gateway-mock.factory';

export interface InternalServicesStub {
  url: string;
  workOrders: Map<string, object>;
  services: Map<string, object>;
  partsSupplies: Map<string, object>;
  failingIds: Set<string>;
  close(): Promise<void>;
}

const RESOURCES: Record<string, { name: string; store: keyof InternalServicesStubStores }> = {
  'work-orders': { name: 'Ordem de Serviço', store: 'workOrders' },
  services: { name: 'Serviço', store: 'services' },
  'parts-supplies': { name: 'Peça/Insumo', store: 'partsSupplies' },
};

type InternalServicesStubStores = Pick<
  InternalServicesStub,
  'workOrders' | 'services' | 'partsSupplies'
>;

/** Serves the work order and inventory internal routes from in-memory maps. */
export async function startInternalServicesStub(): Promise<InternalServicesStub> {
  const stores: InternalServicesStubStores = {
    workOrders: new Map(),
    services: new Map(),
    partsSupplies: new Map(),
  };
  const failingIds = new Set<string>();

  const server = createServer((req, res) => {
    const [, prefix, resource, id] = (req.url ?? '').split('/');
    const route = prefix === 'internal' ? RESOURCES[resource] : undefined;
    const data = route && stores[route.store].get(id);
    const reply = (statusCode: number, body: object): void => {
      res.writeHead(statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (failingIds.has(id)) {
      reply(500, { statusCode: 500, error: 'Internal Server Error', message: 'Erro interno' });
    } else if (data) {
      reply(200, { data });
    } else {
      reply(404, {
        statusCode: 404,
        error: 'Not Found',
        message: `${route?.name ?? 'Recurso'} não encontrado(a) com identificador: ${id}`,
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    ...stores,
    failingIds,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function stubWorkOrder(
  stub: InternalServicesStub,
  overrides: { status?: WorkOrderStatus } = {},
): { id: string; status: WorkOrderStatus } {
  const workOrder = {
    ...readInternalWorkOrderFixture().data,
    id: randomUUID(),
    status: WorkOrderStatus.IN_DIAGNOSIS,
    ...overrides,
  };

  stub.workOrders.set(workOrder.id, workOrder);

  return workOrder;
}

export function stubService(
  stub: InternalServicesStub,
  overrides: { basePrice?: number } = {},
): { id: string; name: string; basePrice: number } {
  const service = { ...readInternalServiceFixture().data, id: randomUUID(), ...overrides };

  stub.services.set(service.id, service);

  return service;
}

export function stubPartSupply(
  stub: InternalServicesStub,
  overrides: { salePrice?: number } = {},
): { id: string; name: string; salePrice: number } {
  const partSupply = { ...readInternalPartSupplyFixture().data, id: randomUUID(), ...overrides };

  stub.partsSupplies.set(partSupply.id, partSupply);

  return partSupply;
}
