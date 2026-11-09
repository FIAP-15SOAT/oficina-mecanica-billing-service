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
import { signMercadoPagoWebhook } from '../helpers/mercado-pago-webhook.helper';
import { signTestStaffToken } from '../helpers/staff-jwt.helper';
import {
  MERCADOPAGO_TEST_WEBHOOK_SECRET,
  TestContext,
  setupTestApp,
  teardownTestApp,
} from '../helpers/test-app.helper';

describe('Payment webhook (E2E)', () => {
  const staffToken = signTestStaffToken({
    sub: randomUUID(),
    email: 'attendant@e2e.test',
    name: 'Attendant E2E',
    role: 'ATTENDANT',
  });

  const requestId = randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));

  let internalServices: InternalServicesStub;
  let mercadoPago: MercadoPagoStub;
  let ctx: TestContext;
  let httpServer: Server;
  let workOrderId: string;

  beforeAll(async () => {
    internalServices = await startInternalServicesStub();
    mercadoPago = await startMercadoPagoStub();

    ctx = await setupTestApp({
      captureLogs: true,
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

    ctx.logCapture?.clear();

    workOrderId = stubWorkOrder(internalServices, { status: WorkOrderStatus.APPROVED }).id;

    await ctx.prisma.quote.create({
      data: { workOrderId, status: 'APPROVED', totalAmount: 500, approvedAt: new Date() },
    });
  });

  it('should answer 401 for an invalid signature and change nothing', async () => {
    const { body } = await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ workOrderId, amount: 100 })
      .expect(201);

    mercadoPago.orders.get(body.data.checkoutId)!.status = 'processed';

    const res = await request(httpServer)
      .post(`/webhooks/mercadopago?data.id=${body.data.checkoutId}&type=order`)
      .set('x-request-id', requestId)
      .set('x-signature', `ts=${ts},v1=${'0'.repeat(64)}`)
      .expect(401);

    expect(res.body.message).toBe('Assinatura do webhook inválida');

    const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: body.data.id } });

    expect(payment.status).toBe('PENDING');

    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: 'billing.payment.approved' } }),
    ).toBe(0);
  });

  it('should approve the payment, store billing.payment.approved and answer 200 for a processed order', async () => {
    const { body } = await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ workOrderId, amount: 100 })
      .expect(201);

    mercadoPago.orders.get(body.data.checkoutId)!.status = 'processed';

    await request(httpServer)
      .post(`/webhooks/mercadopago?data.id=${body.data.checkoutId}&type=order`)
      .set('x-request-id', requestId)
      .set(
        'x-signature',
        signMercadoPagoWebhook({
          dataId: body.data.checkoutId,
          requestId,
          ts,
          secret: MERCADOPAGO_TEST_WEBHOOK_SECRET,
        }),
      )
      .expect(200);

    const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: body.data.id } });

    const messages = await ctx.prisma.outboxMessage.findMany({
      where: { type: 'billing.payment.approved' },
    });

    expect(payment.status).toBe('APPROVED');
    expect(messages).toHaveLength(1);
    expect(messages[0].workOrderId).toBe(workOrderId);
  });

  it('should answer 200 and change nothing when the same notification arrives again', async () => {
    const { body } = await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ workOrderId, amount: 100 })
      .expect(201);

    mercadoPago.orders.get(body.data.checkoutId)!.status = 'processed';

    const signature = signMercadoPagoWebhook({
      dataId: body.data.checkoutId,
      requestId,
      ts,
      secret: MERCADOPAGO_TEST_WEBHOOK_SECRET,
    });

    await request(httpServer)
      .post(`/webhooks/mercadopago?data.id=${body.data.checkoutId}&type=order`)
      .set('x-request-id', requestId)
      .set('x-signature', signature)
      .expect(200);

    const approved = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: body.data.id } });

    await request(httpServer)
      .post(`/webhooks/mercadopago?data.id=${body.data.checkoutId}&type=order`)
      .set('x-request-id', requestId)
      .set('x-signature', signature)
      .expect(200);

    const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: body.data.id } });

    expect(payment).toEqual(approved);

    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: 'billing.payment.approved' } }),
    ).toBe(1);
  });

  it('should keep the payment PENDING and answer 200 while the order is processing', async () => {
    const { body } = await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ workOrderId, amount: 100 })
      .expect(201);

    mercadoPago.orders.get(body.data.checkoutId)!.status = 'processing';

    await request(httpServer)
      .post(`/webhooks/mercadopago?data.id=${body.data.checkoutId}&type=order`)
      .set('x-request-id', requestId)
      .set(
        'x-signature',
        signMercadoPagoWebhook({
          dataId: body.data.checkoutId,
          requestId,
          ts,
          secret: MERCADOPAGO_TEST_WEBHOOK_SECRET,
        }),
      )
      .expect(200);

    const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: body.data.id } });

    expect(payment.status).toBe('PENDING');

    expect(
      await ctx.prisma.outboxMessage.count({
        where: { type: { not: 'billing.payment.requested' } },
      }),
    ).toBe(0);
  });

  it('should keep the access token, the webhook secret and the signature out of the logs', async () => {
    const { body } = await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ workOrderId, amount: 100 })
      .expect(201);

    mercadoPago.orders.get(body.data.checkoutId)!.status = 'processed';

    const signature = signMercadoPagoWebhook({
      dataId: body.data.checkoutId,
      requestId,
      ts,
      secret: MERCADOPAGO_TEST_WEBHOOK_SECRET,
    });

    await request(httpServer)
      .post(`/webhooks/mercadopago?data.id=${body.data.checkoutId}&type=order`)
      .set('x-request-id', requestId)
      .set('x-signature', signature)
      .expect(200);

    const lines = ctx.logCapture!.lines().map((line) => JSON.stringify(line));

    expect(lines.some((line) => line.includes('payment.webhook.received'))).toBe(true);
    expect(lines.filter((line) => line.includes('test-access-token'))).toEqual([]);
    expect(lines.filter((line) => line.includes(MERCADOPAGO_TEST_WEBHOOK_SECRET))).toEqual([]);
    expect(lines.filter((line) => line.includes(signature))).toEqual([]);
  });
});
