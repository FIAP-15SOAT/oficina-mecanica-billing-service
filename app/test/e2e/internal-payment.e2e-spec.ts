import type { Server } from 'http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';

import { cleanDatabase } from '../helpers/db-cleanup.helper';
import { TestContext, setupTestApp, teardownTestApp } from '../helpers/test-app.helper';

// The work order service URL keeps the default that refuses every connection: these routes never
// call it back.
describe('Internal payment routes (E2E)', () => {
  const paymentsFixture = JSON.parse(
    readFileSync(join(__dirname, '../contracts/internal-work-order-payments.json'), 'utf8'),
  );

  const balanceFixture = JSON.parse(
    readFileSync(join(__dirname, '../contracts/internal-work-order-balance.json'), 'utf8'),
  );

  const workOrderId: string = paymentsFixture.data[0].workOrderId;

  let ctx: TestContext;
  let httpServer: Server;

  beforeAll(async () => {
    ctx = await setupTestApp();
    httpServer = ctx.httpServer;
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  // The fixture payments themselves are seeded, so the answer must equal the fixture value by value.
  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);

    await ctx.prisma.quote.create({
      data: { workOrderId, status: 'APPROVED', totalAmount: 500, approvedAt: new Date() },
    });

    await ctx.prisma.payment.createMany({ data: paymentsFixture.data });
  });

  it('should answer the payments list as the contract fixture', async () => {
    const res = await request(httpServer)
      .get(`/internal/work-orders/${workOrderId}/payments`)
      .expect(200);

    expect(res.body).toEqual({ data: paymentsFixture.data });
  });

  it('should answer the balance as the contract fixture', async () => {
    const res = await request(httpServer)
      .get(`/internal/work-orders/${workOrderId}/balance`)
      .expect(200);

    expect(res.body).toEqual({ data: balanceFixture.data });
  });
});
