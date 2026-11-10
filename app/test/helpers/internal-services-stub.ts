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
  /** Ids whose route answers 500, as a failure of the owner. */
  failingIds: Set<string>;
  close(): Promise<void>;
}

interface InternalServicesStubResponse {
  status: number;
  body: object;
}

/** Answers one route from its path params. */
type RouteHandler = (params: Record<string, string>) => InternalServicesStubResponse;

const internalError: InternalServicesStubResponse = {
  status: 500,
  body: { statusCode: 500, error: 'Internal Server Error', message: 'Erro interno' },
};

const notFound = (name: string, id: string): InternalServicesStubResponse => ({
  status: 404,
  body: {
    statusCode: 404,
    error: 'Not Found',
    message: `${name} não encontrado(a) com identificador: ${id}`,
  },
});

const found = (data: object | undefined, name: string, id: string): InternalServicesStubResponse =>
  data ? { status: 200, body: { data } } : notFound(name, id);

/** Serves the Work Order and the Inventory internal routes from in-memory maps. */
export async function startInternalServicesStub(): Promise<InternalServicesStub> {
  const workOrders = new Map<string, object>();
  const services = new Map<string, object>();
  const partsSupplies = new Map<string, object>();
  const failingIds = new Set<string>();

  const routes = Object.entries<RouteHandler>({
    'GET /internal/work-orders/:id': ({ id }) => found(workOrders.get(id), 'Ordem de Serviço', id),
    'GET /internal/services/:id': ({ id }) => found(services.get(id), 'Serviço', id),
    'GET /internal/parts-supplies/:id': ({ id }) => found(partsSupplies.get(id), 'Peça/Insumo', id),
  }).map(([route, handle]) => {
    const [method, pathname] = route.split(' ');

    return { method, pattern: new URLPattern({ pathname }), handle };
  });

  const answer = (method: string, path: string): InternalServicesStubResponse => {
    const { pathname } = new URL(path, 'http://localhost');

    for (const route of routes) {
      const match = route.method === method ? route.pattern.exec({ pathname }) : null;

      if (match) {
        // Every param is a required ":name" segment, so a match always captures it.
        const params = match.pathname.groups as Record<string, string>;

        return failingIds.has(params.id) ? internalError : route.handle(params);
      }
    }

    return notFound('Recurso', path);
  };

  const server = createServer((req, res) => {
    const { status, body } = answer(req.method ?? 'GET', req.url ?? '/');

    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    workOrders,
    services,
    partsSupplies,
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
