// Stands in for the Mercado Pago Orders API during the DAST scan, so the payment routes run
// with no real credential. Ids are upper case, as Mercado Pago issues them.
import { createServer } from 'node:http';

const PORT = 3000;
const orders = new Map();
let sequence = 0;

const orderNotFound = { status: 404, body: { message: 'order not found' } };

const readBody = async (req) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');

  return text ? JSON.parse(text) : {};
};

const createOrder = (body) => {
  sequence += 1;

  const orderId = `ORD${String(sequence).padStart(6, '0')}`;

  const created = {
    id: orderId,
    status: 'created',
    external_reference: body.external_reference,
    checkout_url: `https://localhost/checkout/${orderId}`,
  };

  orders.set(orderId, created);

  return { status: 201, body: created };
};

const cancelOrder = (id) => {
  const order = orders.get(id);

  if (!order) {
    return orderNotFound;
  }

  if (order.status !== 'created') {
    return { status: 409, body: { message: 'order cannot be canceled' } };
  }

  order.status = 'canceled';

  return { status: 200, body: order };
};

const handlers = {
  'POST /v1/orders': (_params, body) => createOrder(body),
  'GET /v1/orders/:id': ({ id }) =>
    orders.has(id) ? { status: 200, body: orders.get(id) } : orderNotFound,
  'POST /v1/orders/:id/cancel': ({ id }) => cancelOrder(id),
};

const routes = Object.entries(handlers).map(([route, handle]) => {
  const [method, pathname] = route.split(' ');

  return { method, pattern: new URLPattern({ pathname }), handle };
});

const answer = async (req) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const body = await readBody(req);

  for (const { method, pattern, handle } of routes) {
    const match = method === req.method ? pattern.exec({ pathname }) : null;

    if (match) {
      return handle(match.pathname.groups, body);
    }
  }

  return { status: 404, body: { message: 'route not found' } };
};

createServer(async (req, res) => {
  try {
    const { status, body } = await answer(req);

    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'invalid request' }));
  }
}).listen(PORT, () => console.log(`mercado pago stub listening on ${PORT}`));
