import type { Server } from 'http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';

import { cleanDatabase } from '../helpers/db-cleanup.helper';
import {
  InternalServicesStub,
  startInternalServicesStub,
  stubPartSupply,
  stubService,
} from '../helpers/internal-services-stub';
import { TestContext, setupTestApp, teardownTestApp } from '../helpers/test-app.helper';

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, `../contracts/${name}`), 'utf8'));
}

// Keys at every level mapped to their JSON type; the fixture's `$source` header is not part of the contract.
function jsonShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(jsonShape);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$source')
        .map(([key, nested]) => [key, jsonShape(nested)]),
    );
  }

  return value === null ? 'null' : typeof value;
}

describe('Internal quote routes (E2E)', () => {
  let stub: InternalServicesStub;
  let ctx: TestContext;
  let httpServer: Server;

  beforeAll(async () => {
    stub = await startInternalServicesStub();
    ctx = await setupTestApp({ internalServicesUrl: stub.url, withSwagger: true });
    httpServer = ctx.httpServer;
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
    await stub.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  async function createInitialQuote(
    workOrderId: string = randomUUID(),
  ): Promise<{ id: string; workOrderId: string }> {
    const service = stubService(stub);
    const partSupply = stubPartSupply(stub);

    const res = await request(httpServer)
      .post('/internal/quotes')
      .send({
        workOrderId,
        services: [{ serviceId: service.id, quantity: 1 }],
        partsSupplies: [{ partSupplyId: partSupply.id, quantity: 2 }],
      })
      .expect(201);

    return { id: res.body.data.id as string, workOrderId };
  }

  async function markSent(quoteId: string): Promise<void> {
    await ctx.prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  describe('POST /internal/quotes', () => {
    it('should create the initial quote with 201 without the work order service', async () => {
      const workOrderId = randomUUID();
      const service = stubService(stub);
      const partSupply = stubPartSupply(stub);

      stub.failingIds.add(workOrderId);

      const res = await request(httpServer)
        .post('/internal/quotes')
        .send({
          workOrderId,
          services: [{ serviceId: service.id, quantity: 1 }],
          partsSupplies: [{ partSupplyId: partSupply.id, quantity: 2 }],
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        workOrderId,
        status: 'PENDING',
        servicesAmount: 129.9,
        partsAmount: 90,
        totalAmount: 219.9,
      });

      expect(jsonShape(res.body)).toEqual(jsonShape(readFixture('internal-quote-summary.json')));
    });

    it('should return the same quote with 201 when the opening repeats', async () => {
      const first = await createInitialQuote();

      const repeated = await createInitialQuote(first.workOrderId);

      expect(repeated.id).toBe(first.id);
      await expect(
        ctx.prisma.quote.count({ where: { workOrderId: first.workOrderId } }),
      ).resolves.toBe(1);
    });

    it('should pass through 404 for an item the inventory does not have', async () => {
      const workOrderId = randomUUID();

      await request(httpServer)
        .post('/internal/quotes')
        .send({ workOrderId, services: [{ serviceId: randomUUID(), quantity: 1 }] })
        .expect(404);

      await expect(ctx.prisma.quote.count({ where: { workOrderId } })).resolves.toBe(0);
    });
  });

  describe('DELETE /internal/quotes/:id', () => {
    it('should delete a PENDING quote with 204', async () => {
      const quote = await createInitialQuote();

      await request(httpServer).delete(`/internal/quotes/${quote.id}`).expect(204);

      await expect(ctx.prisma.quote.findUnique({ where: { id: quote.id } })).resolves.toBeNull();
    });

    it('should answer 404 for a quote already deleted', async () => {
      const quote = await createInitialQuote();

      await request(httpServer).delete(`/internal/quotes/${quote.id}`).expect(204);

      await request(httpServer).delete(`/internal/quotes/${quote.id}`).expect(404);
    });

    it('should refuse to delete a SENT quote with 409', async () => {
      const quote = await createInitialQuote();

      await markSent(quote.id);

      const res = await request(httpServer).delete(`/internal/quotes/${quote.id}`).expect(409);

      expect(res.body.message).toBe(
        'Orçamento só pode ser apagado se estiver no status PENDING. Status atual: "SENT"',
      );
    });
  });

  describe('GET /internal/quotes/:id', () => {
    it('should serve the detail with items, total and decidedBy matching the fixture', async () => {
      const decidedBy = randomUUID();
      const quote = await createInitialQuote();

      await markSent(quote.id);

      await request(httpServer)
        .post(`/internal/quotes/${quote.id}/decisions`)
        .send({ action: 'approve', decidedBy })
        .expect(200);

      const res = await request(httpServer).get(`/internal/quotes/${quote.id}`).expect(200);

      expect(res.body.data).toMatchObject({
        id: quote.id,
        workOrderId: quote.workOrderId,
        status: 'APPROVED',
        decidedBy,
        totalAmount: 219.9,
        services: [expect.objectContaining({ quantity: 1, unitPrice: 129.9 })],
        partsSupplies: [expect.objectContaining({ quantity: 2, unitPrice: 45 })],
      });

      expect(jsonShape(res.body)).toEqual(jsonShape(readFixture('internal-quote.json')));
    });
  });

  describe('GET /internal/work-orders/:workOrderId/quotes', () => {
    it('should list the quotes of a work order matching the fixture', async () => {
      const quote = await createInitialQuote();

      const res = await request(httpServer)
        .get(`/internal/work-orders/${quote.workOrderId}/quotes`)
        .expect(200);

      expect(res.body.data).toEqual([expect.objectContaining({ id: quote.id })]);
      expect(jsonShape(res.body)).toEqual(
        jsonShape(readFixture('internal-work-order-quotes.json')),
      );
    });
  });

  describe('POST /internal/quotes/:id/decisions', () => {
    it('should approve a customer decision without reading the work order', async () => {
      const decidedBy = randomUUID();
      const quote = await createInitialQuote();

      stub.failingIds.add(quote.workOrderId);
      await markSent(quote.id);

      const res = await request(httpServer)
        .post(`/internal/quotes/${quote.id}/decisions`)
        .send({ action: 'approve', decidedBy })
        .expect(200);

      expect(res.body.data).toMatchObject({ id: quote.id, status: 'APPROVED', decidedBy });
      expect(res.body.data.services).toHaveLength(1);

      await expect(
        ctx.prisma.outboxMessage.count({ where: { type: 'billing.quote.approved' } }),
      ).resolves.toBe(1);
    });

    it('should reject a customer decision with the reason', async () => {
      const decidedBy = randomUUID();
      const quote = await createInitialQuote();

      await markSent(quote.id);

      const res = await request(httpServer)
        .post(`/internal/quotes/${quote.id}/decisions`)
        .send({ action: 'reject', reason: 'Valor acima do previsto', decidedBy })
        .expect(200);

      expect(res.body.data).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Valor acima do previsto',
        decidedBy,
      });
    });

    it('should answer 409 to a decision on a quote outside SENT', async () => {
      const quote = await createInitialQuote();

      await request(httpServer)
        .post(`/internal/quotes/${quote.id}/decisions`)
        .send({ action: 'approve', decidedBy: randomUUID() })
        .expect(409);
    });

    it('should answer 409 to an approval when the work order already has an APPROVED quote', async () => {
      const quote = await createInitialQuote();

      await ctx.prisma.quote.create({
        data: { workOrderId: quote.workOrderId, status: 'APPROVED', approvedAt: new Date() },
      });

      await markSent(quote.id);

      const res = await request(httpServer)
        .post(`/internal/quotes/${quote.id}/decisions`)
        .send({ action: 'approve', decidedBy: randomUUID() })
        .expect(409);

      expect(res.body.message).toBe('A ordem de serviço já tem um orçamento aprovado');
    });

    it('should answer 400 to an author that is not a UUID', async () => {
      const quote = await createInitialQuote();

      const res = await request(httpServer)
        .post(`/internal/quotes/${quote.id}/decisions`)
        .send({ action: 'approve', decidedBy: 'customer' })
        .expect(400);

      expect(res.body.message).toEqual(['O autor da decisão deve ser um UUID válido']);
    });
  });

  describe('GET /internal/{services,parts-supplies}/:id/quote-usage', () => {
    it('should answer inUse true for a service a quote uses, matching the fixture', async () => {
      const service = stubService(stub);

      await request(httpServer)
        .post('/internal/quotes')
        .send({ workOrderId: randomUUID(), services: [{ serviceId: service.id, quantity: 1 }] })
        .expect(201);

      const res = await request(httpServer)
        .get(`/internal/services/${service.id}/quote-usage`)
        .expect(200);

      expect(res.body).toEqual({ data: { inUse: true } });
      expect(jsonShape(res.body)).toEqual(jsonShape(readFixture('internal-quote-usage.json')));
    });

    it('should answer inUse false for a part supply no quote uses', async () => {
      await createInitialQuote();

      const res = await request(httpServer)
        .get(`/internal/parts-supplies/${randomUUID()}/quote-usage`)
        .expect(200);

      expect(res.body).toEqual({ data: { inUse: false } });
    });

    it('should count a part supply used by a quote outside PENDING', async () => {
      const partSupply = stubPartSupply(stub);

      const res = await request(httpServer)
        .post('/internal/quotes')
        .send({
          workOrderId: randomUUID(),
          services: [{ serviceId: stubService(stub).id, quantity: 1 }],
          partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
        })
        .expect(201);

      await ctx.prisma.quote.update({
        where: { id: res.body.data.id as string },
        data: { status: 'REJECTED', rejectedAt: new Date() },
      });

      await request(httpServer)
        .get(`/internal/parts-supplies/${partSupply.id}/quote-usage`)
        .expect(200, { data: { inUse: true } });
    });

    it('should answer 400 for an item id that is not a UUID', async () => {
      await request(httpServer).get('/internal/services/not-a-uuid/quote-usage').expect(400);
    });
  });

  it('should serve the internal routes without token and outside Swagger', async () => {
    const quote = await createInitialQuote();

    await request(httpServer).get(`/internal/quotes/${quote.id}`).expect(200);
    await request(httpServer).get(`/api/internal/quotes/${quote.id}`).expect(404);

    const res = await request(httpServer).get('/api/docs-json').expect(200);

    const internalPaths = Object.keys(res.body.paths as object).filter((path) =>
      path.startsWith('/internal'),
    );

    expect(internalPaths).toEqual([]);
  });
});
