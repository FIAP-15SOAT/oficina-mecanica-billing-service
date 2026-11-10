// Stands in for the Work Order and the Inventory during the DAST scan: without it the quote
// routes would answer 503 and ZAP would flag every 5xx.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const PORT = 3000;
const contractsDir = process.env.CONTRACTS_DIR;

if (!contractsDir) {
  throw new Error('CONTRACTS_DIR is required');
}

const readFixtureData = (path) =>
  JSON.parse(readFileSync(join(contractsDir, path), 'utf8')).data;

// IN_DIAGNOSIS lets the scan create and submit quotes for any work order id.
const workOrder = {
  ...readFixtureData('work-order/internal-work-order.json'),
  status: 'IN_DIAGNOSIS',
  services: [],
  partSupplies: [],
};
const service = readFixtureData('inventory/internal-service.json');
const partSupply = readFixtureData('inventory/internal-part-supply.json');

const notFound = {
  status: 404,
  body: { statusCode: 404, error: 'Not Found', message: 'Recurso não encontrado' },
};

const handlers = {
  'GET /internal/work-orders/:id': ({ id }) => ({
    status: 200,
    body: { data: { ...workOrder, id } },
  }),
  'GET /internal/services/:id': ({ id }) => ({ status: 200, body: { data: { ...service, id } } }),
  'GET /internal/parts-supplies/:id': ({ id }) => ({
    status: 200,
    body: { data: { ...partSupply, id } },
  }),
};

const routes = Object.entries(handlers).map(([route, handle]) => {
  const [method, pathname] = route.split(' ');

  return { method, pattern: new URLPattern({ pathname }), handle };
});

const answer = (req) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  for (const { method, pattern, handle } of routes) {
    const match = method === req.method ? pattern.exec({ pathname }) : null;

    if (match) {
      return handle(match.pathname.groups);
    }
  }

  return notFound;
};

createServer((req, res) => {
  const { status, body } = answer(req);

  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`internal services stub listening on ${PORT}`));
