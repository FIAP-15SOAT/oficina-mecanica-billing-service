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

  const server = createServer((req, res) => {
    void (async () => {
      const method = req.method ?? 'GET';
      const path = req.url ?? '/';
      const body = await readBody(req);
      const [, , , id, action] = path.split('/');
      const order = id === undefined ? undefined : stub.orders.get(id);

      const reply = (statusCode: number, payload: object): void => {
        res.writeHead(statusCode, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      stub.requests.push({ method, path, headers: req.headers, body });

      if (stub.unavailable) {
        reply(503, { message: 'service unavailable' });
      } else if (method === 'POST' && path === '/v1/orders') {
        await sleep(stub.orderCreationDelayMs);

        sequence += 1;

        const created: MercadoPagoStubOrder = {
          id: `ORD${String(sequence).padStart(6, '0')}`,
          status: 'created',
          external_reference: (body as { external_reference: string }).external_reference,
          checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${sequence}`,
        };

        stub.orders.set(created.id, created);
        reply(201, created);
      } else if (!order) {
        reply(404, { message: 'order not found' });
      } else if (method === 'GET' && action === undefined) {
        reply(200, order);
      } else if (method === 'POST' && action === 'cancel' && order.status === 'created') {
        order.status = 'canceled';
        reply(200, order);
      } else if (method === 'POST' && action === 'cancel') {
        reply(409, { message: 'order cannot be canceled' });
      } else {
        reply(404, { message: 'route not found' });
      }
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return Object.assign(stub, {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
}
