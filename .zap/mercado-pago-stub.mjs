// Stands in for the Mercado Pago Orders API during the DAST scan, so the payment routes run
// with no real credential. Ids are upper case, as Mercado Pago issues them.
import { createServer } from 'node:http';

const PORT = 3000;
const orders = new Map();
let sequence = 0;

const reply = (res, statusCode, body) => {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');

  return text ? JSON.parse(text) : {};
};

createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const [, , , id, action] = path.split('/');
    const body = await readBody(req);
    const order = id === undefined ? undefined : orders.get(id);

    if (req.method === 'POST' && path === '/v1/orders') {
      sequence += 1;

      const orderId = `ORD${String(sequence).padStart(6, '0')}`;

      const created = {
        id: orderId,
        status: 'created',
        external_reference: body.external_reference,
        checkout_url: `https://localhost/checkout/${orderId}`,
      };

      orders.set(orderId, created);

      reply(res, 201, created);
    } else if (!order) {
      reply(res, 404, { message: 'order not found' });
    } else if (req.method === 'GET' && action === undefined) {
      reply(res, 200, order);
    } else if (req.method === 'POST' && action === 'cancel' && order.status === 'created') {
      order.status = 'canceled';
      reply(res, 200, order);
    } else if (req.method === 'POST' && action === 'cancel') {
      reply(res, 409, { message: 'order cannot be canceled' });
    } else {
      reply(res, 404, { message: 'route not found' });
    }
  } catch {
    reply(res, 400, { message: 'invalid request' });
  }
}).listen(PORT, () => console.log(`mercado pago stub listening on ${PORT}`));
