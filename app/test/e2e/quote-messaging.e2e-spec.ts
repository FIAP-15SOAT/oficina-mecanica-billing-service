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

// The command enters through the outbox and comes back to billing.fifo; the reply is read where
// the work order service would read it, in work-order.fifo.
describe('Quote messaging (E2E)', () => {
  let ctx: TestContext;
  let unitOfWork: IUnitOfWork;
  let sqs: SQSClient;
  let billingQueueUrl: string;
  let workOrderQueueUrl: string;
  const published: MessageEnvelope[] = [];

  beforeAll(async () => {
    ctx = await setupTestApp({ withMessaging: true, captureLogs: true });
    unitOfWork = ctx.app.get<IUnitOfWork>('IUnitOfWork');
    sqs = ctx.app.get(SQSClient);

    const billingQueue = await sqs.send(new GetQueueUrlCommand({ QueueName: 'billing.fifo' }));
    billingQueueUrl = billingQueue.QueueUrl as string;

    const workOrderQueue = await sqs.send(new GetQueueUrlCommand({ QueueName: 'work-order.fifo' }));
    workOrderQueueUrl = workOrderQueue.QueueUrl as string;
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  function sendRevertCommand(
    workOrderId: string,
    quoteId: string,
    revertTo: 'SENT' | 'REJECTED' = 'SENT',
  ): Promise<void> {
    return unitOfWork.executeTransaction((repositories) =>
      repositories.outbox.add({
        type: 'billing.quote.revert_approval',
        workOrderId,
        payload: { quoteId, revertTo },
      }),
    );
  }

  async function receivePublished(): Promise<void> {
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
  }

  async function waitForApprovalReverted(workOrderId: string): Promise<MessageEnvelope[]> {
    const publishedFor = () =>
      published.filter(
        (envelope) =>
          envelope.workOrderId === workOrderId &&
          envelope.type === 'billing.quote.approval_reverted',
      );

    await waitFor(async () => {
      await receivePublished();

      return publishedFor().length > 0;
    });

    return publishedFor();
  }

  function logLines(eventName: string, workOrderId: string) {
    return ctx
      .logCapture!.lines()
      .filter(
        (line) =>
          line['oficina.event.name'] === eventName && line['oficina.work_order.id'] === workOrderId,
      );
  }

  async function waitForAcknowledged(eventName: string, workOrderId: string): Promise<void> {
    await waitFor(() => logLines(eventName, workOrderId).length > 0);

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

    expect(logLines('messaging.message.failed', workOrderId)).toEqual([]);
    expect(logLines('messaging.message.dead_lettered', workOrderId)).toEqual([]);
  }

  it('should revert an APPROVED quote to SENT, restore the quotes it rejected and publish billing.quote.approval_reverted', async () => {
    const workOrderId = randomUUID();

    const approved = await ctx.prisma.quote.create({
      data: {
        workOrderId,
        status: 'APPROVED',
        sentAt: new Date(),
        approvedAt: new Date(),
        decidedBy: randomUUID(),
      },
    });

    const rejectedWhileSent = await ctx.prisma.quote.create({
      data: {
        workOrderId,
        status: 'REJECTED',
        sentAt: new Date(),
        rejectedAt: new Date(),
        replacedByQuoteId: approved.id,
      },
    });

    const rejectedWhilePending = await ctx.prisma.quote.create({
      data: {
        workOrderId,
        status: 'REJECTED',
        rejectedAt: new Date(),
        replacedByQuoteId: approved.id,
      },
    });

    const rejectedByCustomer = await ctx.prisma.quote.create({
      data: {
        workOrderId,
        status: 'REJECTED',
        sentAt: new Date(),
        rejectedAt: new Date(),
        rejectionReason: 'Preço alto',
        decidedBy: randomUUID(),
      },
    });

    await sendRevertCommand(workOrderId, approved.id);

    const [reply] = await waitForApprovalReverted(workOrderId);

    expect(reply.payload).toEqual({ quoteId: approved.id, revertTo: 'SENT' });

    await expect(
      ctx.prisma.quote.findUnique({ where: { id: approved.id } }),
    ).resolves.toMatchObject({ status: 'SENT', approvedAt: null, decidedBy: null });

    await expect(
      ctx.prisma.quote.findUnique({ where: { id: rejectedWhileSent.id } }),
    ).resolves.toMatchObject({ status: 'SENT', replacedByQuoteId: null, rejectedAt: null });

    await expect(
      ctx.prisma.quote.findUnique({ where: { id: rejectedWhilePending.id } }),
    ).resolves.toMatchObject({ status: 'PENDING', replacedByQuoteId: null, rejectedAt: null });

    await expect(
      ctx.prisma.quote.findUnique({ where: { id: rejectedByCustomer.id } }),
    ).resolves.toEqual(rejectedByCustomer);
  });

  it('should acknowledge a repeated command without changes and leave the quotes rejected by a later approval untouched', async () => {
    const workOrderId = randomUUID();

    const reverted = await ctx.prisma.quote.create({
      data: { workOrderId, status: 'APPROVED', sentAt: new Date(), approvedAt: new Date() },
    });

    const restored = await ctx.prisma.quote.create({
      data: {
        workOrderId,
        status: 'REJECTED',
        sentAt: new Date(),
        rejectedAt: new Date(),
        replacedByQuoteId: reverted.id,
      },
    });

    await sendRevertCommand(workOrderId, reverted.id);
    await waitForApprovalReverted(workOrderId);

    // The restored quote was approved afterwards and rejected the reverted one.
    const rejectedByLaterApproval = await ctx.prisma.quote.update({
      where: { id: reverted.id },
      data: { status: 'REJECTED', rejectedAt: new Date(), replacedByQuoteId: restored.id },
    });

    const laterApproved = await ctx.prisma.quote.update({
      where: { id: restored.id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });

    await sendRevertCommand(workOrderId, reverted.id);

    await waitForAcknowledged('quote.approval_revert_skipped', workOrderId);

    expect(logLines('quote.approval_revert_skipped', workOrderId)[0]).toMatchObject({
      level: 'info',
      'oficina.quote.id': reverted.id,
      'oficina.quote.status': 'REJECTED',
    });

    await expect(ctx.prisma.quote.findUnique({ where: { id: reverted.id } })).resolves.toEqual(
      rejectedByLaterApproval,
    );

    await expect(ctx.prisma.quote.findUnique({ where: { id: restored.id } })).resolves.toEqual(
      laterApproved,
    );

    await receivePublished();

    expect(
      published.filter(
        (envelope) =>
          envelope.workOrderId === workOrderId &&
          envelope.type === 'billing.quote.approval_reverted',
      ),
    ).toHaveLength(1);
  });

  it('should acknowledge a command for an unknown quote without changes', async () => {
    const workOrderId = randomUUID();
    const quoteId = randomUUID();

    await sendRevertCommand(workOrderId, quoteId, 'REJECTED');

    await waitForAcknowledged('quote.approval_revert_skipped', workOrderId);

    const [skipped] = logLines('quote.approval_revert_skipped', workOrderId);

    expect(skipped).toMatchObject({ 'oficina.quote.id': quoteId });
    expect(skipped).not.toHaveProperty('oficina.quote.status');
    await expect(ctx.prisma.quote.count()).resolves.toBe(0);
  });
});
