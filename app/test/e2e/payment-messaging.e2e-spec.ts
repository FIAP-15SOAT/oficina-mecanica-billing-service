import { randomUUID } from 'node:crypto';
import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { MessageEnvelope } from '@application/messaging/message-envelope';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { cleanDatabase } from '../helpers/db-cleanup.helper';
import { MercadoPagoStub, startMercadoPagoStub } from '../helpers/mercado-pago-stub';
import { TestContext, setupTestApp, teardownTestApp } from '../helpers/test-app.helper';

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${timeoutMs} ms`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// The command enters through the outbox and comes back to billing.fifo, as the work order Saga
// sends it; the outcome is read where the work order service reads it, in work-order.fifo.
describe('Payment messaging (E2E)', () => {
  let mercadoPago: MercadoPagoStub;
  let ctx: TestContext;
  let unitOfWork: IUnitOfWork;
  let sqs: SQSClient;
  let billingQueueUrl: string;
  let workOrderQueueUrl: string;
  let workOrderId: string;
  let paymentId: string;
  let checkoutId: string;

  beforeAll(async () => {
    mercadoPago = await startMercadoPagoStub();

    ctx = await setupTestApp({
      withMessaging: true,
      captureLogs: true,
      mercadoPagoUrl: mercadoPago.url,
    });

    unitOfWork = ctx.app.get<IUnitOfWork>('IUnitOfWork');
    sqs = ctx.app.get(SQSClient);

    const billingQueue = await sqs.send(new GetQueueUrlCommand({ QueueName: 'billing.fifo' }));
    billingQueueUrl = billingQueue.QueueUrl as string;

    const workOrderQueue = await sqs.send(new GetQueueUrlCommand({ QueueName: 'work-order.fifo' }));
    workOrderQueueUrl = workOrderQueue.QueueUrl as string;
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
    await mercadoPago.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);

    workOrderId = randomUUID();
    paymentId = randomUUID();
    checkoutId = `ORD${randomUUID().slice(0, 8).toUpperCase()}`;

    mercadoPago.orders.set(checkoutId, {
      id: checkoutId,
      status: 'created',
      external_reference: paymentId,
      checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1',
    });

    await ctx.prisma.payment.create({
      data: {
        id: paymentId,
        workOrderId,
        amount: 100,
        checkoutId,
        checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });

  it('should cancel the payment when billing.payment.cancel arrives and publish billing.payment.failed', async () => {
    const published: MessageEnvelope[] = [];

    await unitOfWork.executeTransaction((repositories) =>
      repositories.outbox.add({
        type: 'billing.payment.cancel',
        workOrderId,
        payload: { paymentId, reason: 'Saga compensada' },
      }),
    );

    await waitFor(async () => {
      const { Messages = [] } = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: workOrderQueueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
        }),
      );

      for (const message of Messages) {
        published.push(JSON.parse(message.Body as string) as MessageEnvelope);

        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: workOrderQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }

      return published.some((envelope) => envelope.workOrderId === workOrderId);
    });

    expect(published.filter((envelope) => envelope.workOrderId === workOrderId)).toMatchObject([
      { type: 'billing.payment.failed', payload: { paymentId, reason: 'CANCELLED' } },
    ]);

    expect(mercadoPago.orders.get(checkoutId)?.status).toBe('canceled');

    await expect(
      ctx.prisma.payment.findUnique({ where: { id: paymentId } }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('should acknowledge the command and keep the payment PENDING while the payment is in progress', async () => {
    const logLines = (eventName: string) =>
      ctx
        .logCapture!.lines()
        .filter(
          (line) =>
            line['oficina.event.name'] === eventName &&
            line['oficina.work_order.id'] === workOrderId,
        );

    mercadoPago.orders.get(checkoutId)!.status = 'action_required';

    await unitOfWork.executeTransaction((repositories) =>
      repositories.outbox.add({
        type: 'billing.payment.cancel',
        workOrderId,
        payload: { paymentId, reason: 'Saga compensada' },
      }),
    );

    await waitFor(() => logLines('payment.cancellation_skipped').length > 0);

    await waitFor(async () => {
      const { Attributes } = await sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: billingQueueUrl,
          AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
        }),
      );

      return (
        Attributes?.ApproximateNumberOfMessages === '0' &&
        Attributes?.ApproximateNumberOfMessagesNotVisible === '0'
      );
    });

    expect(logLines('payment.cancellation_skipped')[0]).toMatchObject({
      'oficina.payment.id': paymentId,
      'oficina.payment.checkout.status': 'IN_PROGRESS',
    });

    expect(logLines('messaging.message.failed')).toEqual([]);

    await expect(
      ctx.prisma.payment.findUnique({ where: { id: paymentId } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });
});
