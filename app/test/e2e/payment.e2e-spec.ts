import type { Server } from 'http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';

import { cleanDatabase } from '../helpers/db-cleanup.helper';
import {
  InternalServicesStub,
  startInternalServicesStub,
  stubWorkOrder,
} from '../helpers/internal-services-stub';
import { MercadoPagoStub, startMercadoPagoStub } from '../helpers/mercado-pago-stub';
import { signTestStaffToken } from '../helpers/staff-jwt.helper';
import { TestContext, setupTestApp, teardownTestApp } from '../helpers/test-app.helper';

describe('Payment (E2E)', () => {
  const staffToken = signTestStaffToken({
    sub: randomUUID(),
    email: 'attendant@e2e.test',
    name: 'Attendant E2E',
    role: 'ATTENDANT',
  });

  let internalServices: InternalServicesStub;
  let mercadoPago: MercadoPagoStub;
  let ctx: TestContext;
  let httpServer: Server;
  let workOrderId: string;

  beforeAll(async () => {
    internalServices = await startInternalServicesStub();
    mercadoPago = await startMercadoPagoStub();

    ctx = await setupTestApp({
      internalServicesUrl: internalServices.url,
      mercadoPagoUrl: mercadoPago.url,
    });

    httpServer = ctx.httpServer;
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
    await internalServices.close();
    await mercadoPago.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);

    mercadoPago.requests.length = 0;
    mercadoPago.unavailable = false;
    mercadoPago.orderCreationDelayMs = 0;

    workOrderId = stubWorkOrder(internalServices, { status: WorkOrderStatus.APPROVED }).id;

    await ctx.prisma.quote.create({
      data: { workOrderId, status: 'APPROVED', totalAmount: 500, approvedAt: new Date() },
    });
  });

  const createPayment = (body: object) =>
    request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send(body);

  const countOrderCreations = (): number =>
    mercadoPago.requests.filter((sent) => sent.method === 'POST' && sent.path === '/v1/orders')
      .length;

  it('should create a payment and answer 201 with the checkout url and the expiration', async () => {
    const before = Date.now();

    const res = await createPayment({ workOrderId, amount: 100 }).expect(201);

    const { data } = res.body;
    const order = mercadoPago.orders.get(data.checkoutId);

    expect(data).toMatchObject({ workOrderId, amount: 100, status: 'PENDING' });
    expect(order).toMatchObject({ external_reference: data.id, checkout_url: data.checkoutUrl });

    expect(new Date(data.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);

    const messages = await ctx.prisma.outboxMessage.findMany({
      where: { type: 'billing.payment.requested' },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].workOrderId).toBe(workOrderId);

    expect(messages[0].payload).toEqual({
      paymentId: data.id,
      amount: '100.00',
      checkoutUrl: data.checkoutUrl,
      expiresAt: new Date(data.expiresAt).toISOString(),
    });
  });

  it('should answer 409 for a second pending payment and create no order', async () => {
    await createPayment({ workOrderId, amount: 100 }).expect(201);

    const res = await createPayment({ workOrderId, amount: 100 }).expect(409);

    expect(res.body.message).toBe('A ordem de serviço já tem uma cobrança pendente');
    expect(countOrderCreations()).toBe(1);
  });

  it('should answer 422 when the amount exceeds the balance', async () => {
    const res = await createPayment({ workOrderId, amount: 500.01 }).expect(422);

    expect(res.body.message).toBe(
      'O valor da cobrança não pode ser maior que o saldo da ordem de serviço. Saldo atual: 500.00',
    );
    expect(countOrderCreations()).toBe(0);
  });

  it('should answer 422 for a zero amount and 400 for an amount with three decimals', async () => {
    const zero = await createPayment({ workOrderId, amount: 0 }).expect(422);
    const threeDecimals = await createPayment({ workOrderId, amount: 10.005 }).expect(400);

    expect(zero.body.message).toBe('O valor da cobrança deve ser maior que zero');
    expect(threeDecimals.body.message).toEqual([
      'O valor da cobrança deve ser um número com no máximo 2 casas decimais',
    ]);
  });

  it('should answer 503 and save nothing when Mercado Pago is unavailable', async () => {
    mercadoPago.unavailable = true;

    const res = await createPayment({ workOrderId, amount: 100 }).expect(503);

    expect(res.body.message).toBe(
      'Não foi possível criar a cobrança no Mercado Pago. Nada foi gravado; tente novamente',
    );
    expect(await ctx.prisma.payment.count()).toBe(0);
    expect(await ctx.prisma.outboxMessage.count()).toBe(0);
  });

  it('should keep a single PENDING payment when two creations race for the same work order', async () => {
    mercadoPago.orderCreationDelayMs = 500;

    const responses = await Promise.all([
      createPayment({ workOrderId, amount: 100 }),
      createPayment({ workOrderId, amount: 100 }),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(countOrderCreations()).toBe(2);
    expect(await ctx.prisma.payment.count({ where: { workOrderId, status: 'PENDING' } })).toBe(1);
  });

  it('should answer 401 without a token', async () => {
    await request(httpServer).post('/api/payments').send({ workOrderId, amount: 100 }).expect(401);
  });
});
