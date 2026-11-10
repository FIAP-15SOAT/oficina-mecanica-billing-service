import { createServer, IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

export interface MercadoPagoStubOrder {
  id: string;
  status: string;
  external_reference: string;
  checkout_url: string;
}

export interface MercadoPagoStubRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface MercadoPagoStub {
  url: string;
  orders: Map<string, MercadoPagoStubOrder>;
  requests: MercadoPagoStubRequest[];
  unavailable: boolean;
  /** Holds every order creation, so concurrent requests all pass the checks before any commit. */
  orderCreationDelayMs: number;
  close(): Promise<void>;
}

interface MercadoPagoStubResponse {
  status: number;
  body: object;
}

/** Answers one route from its path params and the parsed JSON body. */
type RouteHandler = (
  params: Record<string, string>,
  body: unknown,
) => MercadoPagoStubResponse | Promise<MercadoPagoStubResponse>;

const orderNotFound: MercadoPagoStubResponse = {
  status: 404,
  body: { message: 'order not found' },
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');

  return text ? (JSON.parse(text) as unknown) : undefined;
}

/** Serves the Orders API routes the Billing calls, with upper-case ids as Mercado Pago issues. */
export async function startMercadoPagoStub(): Promise<MercadoPagoStub> {
  let sequence = 0;

  const stub = {
    orders: new Map<string, MercadoPagoStubOrder>(),
    requests: [] as MercadoPagoStubRequest[],
    unavailable: false,
    orderCreationDelayMs: 0,
  };

  const createOrder = async (body: unknown): Promise<MercadoPagoStubResponse> => {
    await sleep(stub.orderCreationDelayMs);

    sequence += 1;

    const created: MercadoPagoStubOrder = {
      id: `ORD${String(sequence).padStart(6, '0')}`,
      status: 'created',
      external_reference: (body as { external_reference: string }).external_reference,
      checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${sequence}`,
    };

    stub.orders.set(created.id, created);

    return { status: 201, body: created };
  };

  const cancelOrder = (id: string): MercadoPagoStubResponse => {
    const order = stub.orders.get(id);

    if (!order) {
      return orderNotFound;
    }

    if (order.status !== 'created') {
      return { status: 409, body: { message: 'order cannot be canceled' } };
    }

    order.status = 'canceled';

    return { status: 200, body: order };
  };

  const routes = Object.entries<RouteHandler>({
    'POST /v1/orders': (_params, body) => createOrder(body),
    'GET /v1/orders/:id': ({ id }) => {
      const order = stub.orders.get(id);

      return order ? { status: 200, body: order } : orderNotFound;
    },
    'POST /v1/orders/:id/cancel': ({ id }) => cancelOrder(id),
  }).map(([route, handle]) => {
    const [method, pathname] = route.split(' ');

    return { method, pattern: new URLPattern({ pathname }), handle };
  });

  const answer = async (
    method: string,
    path: string,
    body: unknown,
  ): Promise<MercadoPagoStubResponse> => {
    if (stub.unavailable) {
      return { status: 503, body: { message: 'service unavailable' } };
    }

    const { pathname } = new URL(path, 'http://localhost');

    for (const route of routes) {
      const match = route.method === method ? route.pattern.exec({ pathname }) : null;

      if (match) {
        // Every param is a required ":name" segment, so a match always captures it.
        return route.handle(match.pathname.groups as Record<string, string>, body);
      }
    }

    return { status: 404, body: { message: 'route not found' } };
  };

  const server = createServer((req, res) => {
    void (async () => {
      const method = req.method ?? 'GET';
      const path = req.url ?? '/';
      const body = await readBody(req);

      stub.requests.push({ method, path, headers: req.headers, body });

      const response = await answer(method, path, body);

      res.writeHead(response.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response.body));
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return Object.assign(stub, {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
}
