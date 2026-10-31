import type { Server } from 'http';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import request from 'supertest';
import { sign } from 'jsonwebtoken';

import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

import { cleanDatabase } from '../helpers/db-cleanup.helper';
import {
  InternalServicesStub,
  startInternalServicesStub,
  stubPartSupply,
  stubService,
  stubWorkOrder,
} from '../helpers/internal-services-stub';
import { signTestStaffToken } from '../helpers/staff-jwt.helper';
import { TestContext, setupTestApp, teardownTestApp } from '../helpers/test-app.helper';

describe('Quote (E2E)', () => {
  const staffId = randomUUID();
  const staffToken = signTestStaffToken({
    sub: staffId,
    email: 'admin@e2e.test',
    name: 'Admin E2E',
    role: 'ADMIN',
  });

  let stub: InternalServicesStub;
  let ctx: TestContext;
  let httpServer: Server;

  beforeAll(async () => {
    stub = await startInternalServicesStub();
    ctx = await setupTestApp({ internalServicesUrl: stub.url });
    httpServer = ctx.httpServer;
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
    await stub.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  const api = {
    get: (path: string) =>
      request(httpServer).get(path).set('Authorization', `Bearer ${staffToken}`),
    post: (path: string) =>
      request(httpServer).post(path).set('Authorization', `Bearer ${staffToken}`),
    patch: (path: string) =>
      request(httpServer).patch(path).set('Authorization', `Bearer ${staffToken}`),
    delete: (path: string) =>
      request(httpServer).delete(path).set('Authorization', `Bearer ${staffToken}`),
  };

  async function createQuote(body: object = {}): Promise<{ id: string; workOrderId: string }> {
    const workOrder = stubWorkOrder(stub);
    const res = await api
      .post('/api/quotes')
      .send({ workOrderId: workOrder.id, ...body })
      .expect(201);

    return { id: res.body.data.id as string, workOrderId: workOrder.id };
  }

  async function markSent(quoteId: string): Promise<void> {
    await ctx.prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  describe('authentication', () => {
    it('should answer 401 without a token', async () => {
      await request(httpServer).get('/api/quotes').expect(401);
    });

    it('should answer 401 to a customer token', async () => {
      const customerKey = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      }).privateKey;
      const customerToken = sign({ sub: randomUUID(), email: 'cliente@email.com' }, customerKey, {
        algorithm: 'RS256',
        issuer: 'oficina-customer-auth',
        audience: 'oficina-customer',
        expiresIn: 600,
      });

      await request(httpServer)
        .get('/api/quotes')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(401);
    });
  });

  describe('POST /api/quotes', () => {
    it('should create a quote for a work order in diagnosis with its summary', async () => {
      const workOrder = stubWorkOrder(stub);

      const res = await api.post('/api/quotes').send({ workOrderId: workOrder.id }).expect(201);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          workOrder: expect.objectContaining({ id: workOrder.id, status: 'IN_DIAGNOSIS' }),
          status: 'PENDING',
          totalAmount: 0,
        }),
      );
      expect(res.body.data.workOrder.services).toBeUndefined();
      expect(res.body.data.workOrderId).toBeUndefined();
    });

    it.each([WorkOrderStatus.AWAITING_APPROVAL, WorkOrderStatus.REJECTED])(
      'should create a quote for a %s work order',
      async (status) => {
        const workOrder = stubWorkOrder(stub, { status });

        await api.post('/api/quotes').send({ workOrderId: workOrder.id }).expect(201);
      },
    );

    it('should answer 409 when the work order is RECEIVED', async () => {
      const workOrder = stubWorkOrder(stub, { status: WorkOrderStatus.RECEIVED });

      await api.post('/api/quotes').send({ workOrderId: workOrder.id }).expect(409);
    });

    it('should answer 409 when the work order already has an approved quote', async () => {
      const { id, workOrderId } = await createQuote();

      await ctx.prisma.quote.update({ where: { id }, data: { status: 'APPROVED' } });

      const res = await api.post('/api/quotes').send({ workOrderId }).expect(409);

      expect(res.body.message).toBe('A ordem de serviço já tem um orçamento aprovado');
    });

    it('should answer 404 when the work order service does not know the work order', async () => {
      await api.post('/api/quotes').send({ workOrderId: randomUUID() }).expect(404);
    });

    it('should answer 503 and create nothing when the work order service fails', async () => {
      const workOrder = stubWorkOrder(stub);

      stub.failingIds.add(workOrder.id);

      await api.post('/api/quotes').send({ workOrderId: workOrder.id }).expect(503);
      await expect(ctx.prisma.quote.count()).resolves.toBe(0);
    });

    it('should answer 503 and create nothing when the inventory fails', async () => {
      const workOrder = stubWorkOrder(stub);
      const service = stubService(stub);

      stub.failingIds.add(service.id);

      await api
        .post('/api/quotes')
        .send({ workOrderId: workOrder.id, services: [{ serviceId: service.id, quantity: 1 }] })
        .expect(503);
      await expect(ctx.prisma.quote.count()).resolves.toBe(0);
    });

    it('should answer 400 when the notes exceed the maximum length', async () => {
      const workOrder = stubWorkOrder(stub);

      await api
        .post('/api/quotes')
        .send({ workOrderId: workOrder.id, notes: 'a'.repeat(2001) })
        .expect(400);
    });

    it('should answer 400 when the workOrderId is not a valid UUID', async () => {
      const res = await api.post('/api/quotes').send({ workOrderId: 'not-a-uuid' }).expect(400);

      expect(res.body.message).toEqual(['O ID da ordem de serviço deve ser um UUID válido']);
    });

    it('should create a quote with services and parts priced by the inventory', async () => {
      const workOrder = stubWorkOrder(stub);
      const service = stubService(stub, { basePrice: 100 });
      const partSupply = stubPartSupply(stub, { salePrice: 40 });

      const res = await api
        .post('/api/quotes')
        .send({
          workOrderId: workOrder.id,
          services: [{ serviceId: service.id, quantity: 2 }],
          partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
        })
        .expect(201);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          servicesAmount: 200,
          partsAmount: 40,
          totalAmount: 240,
        }),
      );
    });

    it('should answer 409 for parts without a service', async () => {
      const workOrder = stubWorkOrder(stub);
      const partSupply = stubPartSupply(stub);

      await api
        .post('/api/quotes')
        .send({
          workOrderId: workOrder.id,
          partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
        })
        .expect(409);
    });

    it('should answer 404 for a service the inventory does not have', async () => {
      const workOrder = stubWorkOrder(stub);

      await api
        .post('/api/quotes')
        .send({ workOrderId: workOrder.id, services: [{ serviceId: randomUUID(), quantity: 1 }] })
        .expect(404);
    });

    it('should answer 404 for a part supply the inventory does not have', async () => {
      const workOrder = stubWorkOrder(stub);
      const service = stubService(stub);

      await api
        .post('/api/quotes')
        .send({
          workOrderId: workOrder.id,
          services: [{ serviceId: service.id, quantity: 1 }],
          partsSupplies: [{ partSupplyId: randomUUID(), quantity: 1 }],
        })
        .expect(404);
    });

    it('should answer 409 for a repeated service id', async () => {
      const workOrder = stubWorkOrder(stub);
      const service = stubService(stub);

      await api
        .post('/api/quotes')
        .send({
          workOrderId: workOrder.id,
          services: [
            { serviceId: service.id, quantity: 1 },
            { serviceId: service.id, quantity: 2 },
          ],
        })
        .expect(409);
    });
  });

  describe('GET /api/quotes/:id', () => {
    it('should show the quote with its work order and the inventory display data', async () => {
      const service = stubService(stub, { basePrice: 100 });
      const partSupply = stubPartSupply(stub, { salePrice: 40 });
      const { id, workOrderId } = await createQuote({
        services: [{ serviceId: service.id, quantity: 1 }],
        partsSupplies: [{ partSupplyId: partSupply.id, quantity: 2 }],
      });

      const res = await api.get(`/api/quotes/${id}`).expect(200);

      expect(res.body.data.workOrder.id).toBe(workOrderId);
      expect(res.body.data.services).toEqual([
        expect.objectContaining({ id: service.id, name: service.name, unitPrice: 100 }),
      ]);
      expect(res.body.data.partsSupplies).toEqual([
        expect.objectContaining({
          id: partSupply.id,
          name: partSupply.name,
          sku: 'FO-INT-001',
          unit: 'UN',
          quantity: 2,
          totalPrice: 80,
        }),
      ]);
    });

    it('should keep the frozen price after the inventory price changes', async () => {
      const service = stubService(stub, { basePrice: 100 });
      const { id } = await createQuote({ services: [{ serviceId: service.id, quantity: 1 }] });

      stub.services.set(service.id, { ...service, basePrice: 999 });

      const res = await api.get(`/api/quotes/${id}`).expect(200);

      expect(res.body.data.services[0]).toEqual(
        expect.objectContaining({ unitPrice: 100, totalPrice: 100 }),
      );
      expect(res.body.data.totalAmount).toBe(100);
    });

    it('should show null display fields when the inventory no longer has the item', async () => {
      const service = stubService(stub, { basePrice: 100 });
      const partSupply = stubPartSupply(stub, { salePrice: 40 });
      const { id } = await createQuote({
        services: [{ serviceId: service.id, quantity: 1 }],
        partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
      });

      stub.services.delete(service.id);
      stub.partsSupplies.delete(partSupply.id);

      const res = await api.get(`/api/quotes/${id}`).expect(200);

      expect(res.body.data.services[0]).toEqual(
        expect.objectContaining({ id: service.id, name: null, description: null, unitPrice: 100 }),
      );
      expect(res.body.data.partsSupplies[0]).toEqual(
        expect.objectContaining({
          id: partSupply.id,
          name: null,
          sku: null,
          category: null,
          unit: null,
          unitPrice: 40,
        }),
      );
    });

    it('should answer 503 when the work order service fails', async () => {
      const { id, workOrderId } = await createQuote();

      stub.failingIds.add(workOrderId);

      await api.get(`/api/quotes/${id}`).expect(503);
    });

    it('should answer 404 for an unknown quote', async () => {
      await api.get(`/api/quotes/${randomUUID()}`).expect(404);
    });

    it('should answer 400 for an id that is not a UUID', async () => {
      await api.get('/api/quotes/not-a-uuid').expect(400);
    });
  });

  describe('POST /api/quotes/:id/services', () => {
    it('should add a service priced by the inventory', async () => {
      const { id } = await createQuote();
      const service = stubService(stub, { basePrice: 150 });

      const res = await api
        .post(`/api/quotes/${id}/services`)
        .send({ serviceId: service.id, quantity: 2 })
        .expect(200);

      expect(res.body.data.servicesAmount).toBe(300);
      expect(res.body.data.totalAmount).toBe(300);
    });

    it('should answer 409 when the quote is not pending', async () => {
      const { id } = await createQuote();
      const service = stubService(stub);

      await markSent(id);

      await api
        .post(`/api/quotes/${id}/services`)
        .send({ serviceId: service.id, quantity: 1 })
        .expect(409);
    });

    it('should answer 404 for a service the inventory does not have', async () => {
      const { id } = await createQuote();

      await api
        .post(`/api/quotes/${id}/services`)
        .send({ serviceId: randomUUID(), quantity: 1 })
        .expect(404);
    });

    it('should answer 404 for an unknown quote', async () => {
      const service = stubService(stub);

      await api
        .post(`/api/quotes/${randomUUID()}/services`)
        .send({ serviceId: service.id, quantity: 1 })
        .expect(404);
    });

    it('should answer 400 for a zero quantity', async () => {
      const { id } = await createQuote();
      const service = stubService(stub);

      await api
        .post(`/api/quotes/${id}/services`)
        .send({ serviceId: service.id, quantity: 0 })
        .expect(400);
    });

    it('should answer 400 when the serviceId is not a UUID', async () => {
      const { id } = await createQuote();

      await api
        .post(`/api/quotes/${id}/services`)
        .send({ serviceId: 'not-a-uuid', quantity: 1 })
        .expect(400);
    });

    it('should answer 409 when the service is already in the quote', async () => {
      const service = stubService(stub);
      const { id } = await createQuote({ services: [{ serviceId: service.id, quantity: 1 }] });

      await api
        .post(`/api/quotes/${id}/services`)
        .send({ serviceId: service.id, quantity: 1 })
        .expect(409);
    });
  });

  describe('POST /api/quotes/:id/parts-supplies', () => {
    it('should add a part supply priced by the inventory', async () => {
      const service = stubService(stub, { basePrice: 100 });
      const partSupply = stubPartSupply(stub, { salePrice: 45 });
      const { id } = await createQuote({ services: [{ serviceId: service.id, quantity: 1 }] });

      const res = await api
        .post(`/api/quotes/${id}/parts-supplies`)
        .send({ partSupplyId: partSupply.id, quantity: 2 })
        .expect(200);

      expect(res.body.data.partsAmount).toBe(90);
      expect(res.body.data.totalAmount).toBe(190);
    });

    it('should answer 409 when the quote is not pending', async () => {
      const service = stubService(stub);
      const partSupply = stubPartSupply(stub);
      const { id } = await createQuote({ services: [{ serviceId: service.id, quantity: 1 }] });

      await markSent(id);

      await api
        .post(`/api/quotes/${id}/parts-supplies`)
        .send({ partSupplyId: partSupply.id, quantity: 1 })
        .expect(409);
    });

    it('should answer 404 for a part supply the inventory does not have', async () => {
      const { id } = await createQuote();

      await api
        .post(`/api/quotes/${id}/parts-supplies`)
        .send({ partSupplyId: randomUUID(), quantity: 1 })
        .expect(404);
    });

    it('should answer 400 when the partSupplyId is not a UUID', async () => {
      const { id } = await createQuote();

      await api
        .post(`/api/quotes/${id}/parts-supplies`)
        .send({ partSupplyId: 'not-a-uuid', quantity: 1 })
        .expect(400);
    });

    it('should answer 409 when the part supply is already in the quote', async () => {
      const service = stubService(stub);
      const partSupply = stubPartSupply(stub);
      const { id } = await createQuote({
        services: [{ serviceId: service.id, quantity: 1 }],
        partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
      });

      await api
        .post(`/api/quotes/${id}/parts-supplies`)
        .send({ partSupplyId: partSupply.id, quantity: 1 })
        .expect(409);
    });
  });

  describe('Quote Items Management', () => {
    it('should update and remove items of a pending quote', async () => {
      const service = stubService(stub, { basePrice: 100 });
      const partSupply = stubPartSupply(stub, { salePrice: 10 });
      const { id } = await createQuote({
        services: [{ serviceId: service.id, quantity: 1 }],
        partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
      });

      const updatedService = await api
        .patch(`/api/quotes/${id}/services/${service.id}`)
        .send({ quantity: 3 })
        .expect(200);
      expect(updatedService.body.data.servicesAmount).toBe(300);

      const updatedPart = await api
        .patch(`/api/quotes/${id}/parts-supplies/${partSupply.id}`)
        .send({ quantity: 5 })
        .expect(200);
      expect(updatedPart.body.data.partsAmount).toBe(50);

      await api.delete(`/api/quotes/${id}/parts-supplies/${partSupply.id}`).expect(204);
      await api.delete(`/api/quotes/${id}/services/${service.id}`).expect(204);

      const res = await api.get(`/api/quotes/${id}`).expect(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({ services: [], partsSupplies: [], totalAmount: 0 }),
      );
    });

    it('should show the change in the detail read before it', async () => {
      const service = stubService(stub, { basePrice: 100 });
      const { id } = await createQuote({ services: [{ serviceId: service.id, quantity: 1 }] });

      await api.get(`/api/quotes/${id}`).expect(200);
      await api.patch(`/api/quotes/${id}/services/${service.id}`).send({ quantity: 2 }).expect(200);

      const res = await api.get(`/api/quotes/${id}`).expect(200);
      expect(res.body.data.services[0].quantity).toBe(2);
    });

    it('should answer 400 when updating a service with quantity zero', async () => {
      const service = stubService(stub);
      const { id } = await createQuote({ services: [{ serviceId: service.id, quantity: 1 }] });

      await api.patch(`/api/quotes/${id}/services/${service.id}`).send({ quantity: 0 }).expect(400);
    });

    it('should answer 400 when updating a part supply with quantity zero', async () => {
      const service = stubService(stub);
      const partSupply = stubPartSupply(stub);
      const { id } = await createQuote({
        services: [{ serviceId: service.id, quantity: 1 }],
        partsSupplies: [{ partSupplyId: partSupply.id, quantity: 1 }],
      });

      await api
        .patch(`/api/quotes/${id}/parts-supplies/${partSupply.id}`)
        .send({ quantity: 0 })
        .expect(400);
    });

    it('should answer 404 when updating an item that is not in the quote', async () => {
      const { id } = await createQuote();

      await api
        .patch(`/api/quotes/${id}/services/${randomUUID()}`)
        .send({ quantity: 2 })
        .expect(404);
      await api
        .patch(`/api/quotes/${id}/parts-supplies/${randomUUID()}`)
        .send({ quantity: 2 })
        .expect(404);
    });

    it('should answer 404 when removing an item that is not in the quote', async () => {
      const { id } = await createQuote();

      await api.delete(`/api/quotes/${id}/services/${randomUUID()}`).expect(404);
      await api.delete(`/api/quotes/${id}/parts-supplies/${randomUUID()}`).expect(404);
    });
  });

  describe('POST /api/quotes/:id/submissions', () => {
    async function createQuoteWithService(): Promise<{
      id: string;
      workOrderId: string;
      service: { id: string; name: string; basePrice: number };
    }> {
      const service = stubService(stub, { basePrice: 150.5 });
      const quote = await createQuote({ services: [{ serviceId: service.id, quantity: 2 }] });

      return { ...quote, service };
    }

    function setWorkOrderStatus(workOrderId: string, status: WorkOrderStatus): void {
      stub.workOrders.set(workOrderId, { ...stub.workOrders.get(workOrderId), status });
    }

    it('should submit a quote', async () => {
      const { id } = await createQuoteWithService();

      const res = await api.post(`/api/quotes/${id}/submissions`).expect(200);

      expect(res.body.data).toEqual(expect.objectContaining({ id, status: 'SENT' }));
    });

    it('should write billing.quote.sent to the outbox', async () => {
      const { id, workOrderId, service } = await createQuoteWithService();

      await api.post(`/api/quotes/${id}/submissions`).expect(200);

      const messages = await ctx.prisma.outboxMessage.findMany();
      expect(messages).toEqual([
        expect.objectContaining({
          type: 'billing.quote.sent',
          workOrderId,
          payload: {
            quoteId: id,
            sentBy: staffId,
            total: '301.00',
            items: [{ name: service.name, quantity: 2, unitPrice: '150.50' }],
          },
        }),
      ]);
    });

    it.each([WorkOrderStatus.AWAITING_APPROVAL, WorkOrderStatus.REJECTED])(
      'should submit a quote for a %s work order',
      async (status) => {
        const { id, workOrderId } = await createQuoteWithService();
        setWorkOrderStatus(workOrderId, status);

        await api.post(`/api/quotes/${id}/submissions`).expect(200);
      },
    );

    it('should return 409 when submitting quote with no items', async () => {
      const { id } = await createQuote();

      await api.post(`/api/quotes/${id}/submissions`).expect(409);

      expect(await ctx.prisma.outboxMessage.count()).toBe(0);
    });

    it('should keep the quote PENDING and answer 409 for a RECEIVED work order', async () => {
      const { id, workOrderId } = await createQuoteWithService();
      setWorkOrderStatus(workOrderId, WorkOrderStatus.RECEIVED);

      await api.post(`/api/quotes/${id}/submissions`).expect(409);

      const res = await api.get(`/api/quotes/${id}`).expect(200);
      expect(res.body.data.status).toBe('PENDING');
      expect(await ctx.prisma.outboxMessage.count()).toBe(0);
    });

    it('should keep the quote PENDING and answer 404 when an item is no longer in the inventory', async () => {
      const { id, service } = await createQuoteWithService();
      stub.services.delete(service.id);

      await api.post(`/api/quotes/${id}/submissions`).expect(404);

      const quote = await ctx.prisma.quote.findUniqueOrThrow({ where: { id } });
      expect(quote.status).toBe('PENDING');
      expect(await ctx.prisma.outboxMessage.count()).toBe(0);
    });

    it('should refuse submission with 409 while the work order has an APPROVED quote', async () => {
      const approved = await createQuoteWithService();
      const pending = await createQuote({
        workOrderId: approved.workOrderId,
        services: [{ serviceId: approved.service.id, quantity: 1 }],
      });
      await ctx.prisma.quote.update({ where: { id: approved.id }, data: { status: 'APPROVED' } });

      const res = await api.post(`/api/quotes/${pending.id}/submissions`).expect(409);

      expect(res.body.message).toBe('A ordem de serviço já tem um orçamento aprovado');
      const quote = await ctx.prisma.quote.findUniqueOrThrow({ where: { id: pending.id } });
      expect(quote.status).toBe('PENDING');
      expect(await ctx.prisma.outboxMessage.count()).toBe(0);
    });

    it('should accept creation again after the approved quote went back to SENT', async () => {
      const { id, workOrderId } = await createQuoteWithService();
      await ctx.prisma.quote.update({ where: { id }, data: { status: 'APPROVED' } });
      await api.post('/api/quotes').send({ workOrderId }).expect(409);

      await ctx.prisma.quote.update({ where: { id }, data: { status: 'SENT' } });

      await api.post('/api/quotes').send({ workOrderId }).expect(201);
    });
  });

  describe('Extra Coverage Scenarios', () => {
    it('should answer 404 for the item routes of an unknown quote', async () => {
      const quoteId = randomUUID();

      await api
        .patch(`/api/quotes/${quoteId}/services/${randomUUID()}`)
        .send({ quantity: 1 })
        .expect(404);
      await api
        .patch(`/api/quotes/${quoteId}/parts-supplies/${randomUUID()}`)
        .send({ quantity: 1 })
        .expect(404);
      await api.delete(`/api/quotes/${quoteId}/services/${randomUUID()}`).expect(404);
      await api.delete(`/api/quotes/${quoteId}/parts-supplies/${randomUUID()}`).expect(404);
    });

    it('should return 404 when submitting non-existent quote', async () => {
      await api.post(`/api/quotes/${randomUUID()}/submissions`).expect(404);
    });

    it('should return 409 when submitting a REJECTED quote', async () => {
      const service = stubService(stub);
      const { id } = await createQuote({ services: [{ serviceId: service.id, quantity: 1 }] });
      await ctx.prisma.quote.update({
        where: { id },
        data: { status: 'REJECTED', rejectedAt: new Date() },
      });

      await api.post(`/api/quotes/${id}/submissions`).expect(409);
    });

    it('should sanitize strings with null characters', async () => {
      const workOrder = stubWorkOrder(stub);

      const res = await api
        .post('/api/quotes')
        .send({ workOrderId: workOrder.id, notes: 'nota\u0000 limpa' })
        .expect(201);

      expect(res.body.data.notes).toBe('nota limpa');
    });

    describe('Retrieval', () => {
      it('should list the quotes paginated with their work orders', async () => {
        const first = await createQuote();
        const second = await createQuote();

        const res = await api.get('/api/quotes?page=1&limit=10').expect(200);

        expect(res.body.pagination).toEqual({ totalRecords: 2, totalPages: 1, page: 1, limit: 10 });
        expect(
          res.body.data.map((quote: { workOrder: { id: string } }) => quote.workOrder.id),
        ).toEqual(expect.arrayContaining([first.workOrderId, second.workOrderId]));
      });

      it('should filter the quotes by workOrderId', async () => {
        const { id, workOrderId } = await createQuote();
        await createQuote();

        const res = await api.get(`/api/quotes?workOrderId=${workOrderId}`).expect(200);

        expect(res.body.data).toEqual([expect.objectContaining({ id })]);
      });

      it('should filter the quotes by status', async () => {
        const sent = await createQuote();
        await createQuote();
        await markSent(sent.id);

        const res = await api.get('/api/quotes?status=SENT').expect(200);

        expect(res.body.data).toEqual([expect.objectContaining({ id: sent.id, status: 'SENT' })]);
      });

      it('should answer 400 for an unknown status filter', async () => {
        await api.get('/api/quotes?status=UNKNOWN').expect(400);
      });

      it('should list the quotes of a work order', async () => {
        const { id, workOrderId } = await createQuote();
        await createQuote();

        const res = await api.get(`/api/work-orders/${workOrderId}/quotes`).expect(200);

        expect(res.body.data).toEqual([
          expect.objectContaining({ id, workOrder: expect.objectContaining({ id: workOrderId }) }),
        ]);
      });

      it('should show a quote created after the work order list was read', async () => {
        const { workOrderId } = await createQuote();

        await api.get(`/api/work-orders/${workOrderId}/quotes`).expect(200);
        await api.post('/api/quotes').send({ workOrderId }).expect(201);

        const res = await api.get(`/api/work-orders/${workOrderId}/quotes`).expect(200);
        expect(res.body.data).toHaveLength(2);
      });

      it('should answer 404 when listing the quotes of a work order the work order service does not know', async () => {
        await api.get(`/api/work-orders/${randomUUID()}/quotes`).expect(404);
      });
    });
  });
});
