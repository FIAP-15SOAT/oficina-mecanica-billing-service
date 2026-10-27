import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { IsIn, IsUUID } from 'class-validator';
import {
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { MessageEnvelope } from '@application/messaging/message-envelope';
import { IUnitOfWork } from '@domain/interfaces/repositories/unit-of-work.interface';
import { OutboxMessage } from '@domain/messaging/message-catalog';
import { DECLARED_FIELD_NAMES } from '@infrastructure/logging/field-registry';
import { MessageHandlerRegistry } from '@infrastructure/messaging/message-handler.registry';
import { OUTBOX_RELAY_LOCK_KEY } from '@infrastructure/messaging/outbox-relay.service';
import { TestContext, setupTestApp, teardownTestApp } from '../helpers/test-app.helper';

class RevertApprovalPayload {
  @IsUUID('4')
  quoteId!: string;

  @IsIn(['SENT', 'REJECTED'])
  revertTo!: 'SENT' | 'REJECTED';
}

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

// Every test publishes on its own work order id, so a message stuck in one FIFO group never blocks
// another test. Only the types the filter policy routes to billing.fifo come back to this service.
describe('Messaging (E2E)', () => {
  let ctx: TestContext;
  let unitOfWork: IUnitOfWork;
  let sqs: SQSClient;
  let queueUrl: string;
  const received: MessageEnvelope<'billing.quote.revert_approval'>[] = [];
  const failFirstDelivery = new Set<string>();

  beforeAll(async () => {
    ctx = await setupTestApp({ withMessaging: true, captureLogs: true });
    unitOfWork = ctx.app.get<IUnitOfWork>('IUnitOfWork');
    sqs = ctx.app.get(SQSClient);

    ctx.app.get(MessageHandlerRegistry).register(
      'billing.quote.revert_approval',
      (envelope) => {
        received.push(envelope);

        if (failFirstDelivery.delete(envelope.payload.quoteId)) {
          return Promise.reject(new Error('first delivery fails'));
        }

        return Promise.resolve();
      },
      RevertApprovalPayload,
    );

    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: 'billing.fifo' }));
    queueUrl = QueueUrl as string;

    // A failed delivery comes back in 2 s instead of 30 s.
    await sqs.send(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: { VisibilityTimeout: '2' },
      }),
    );
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  function addMessage(message: OutboxMessage): Promise<void> {
    return unitOfWork.executeTransaction((repositories) => repositories.outbox.add(message));
  }

  function revertApproval(workOrderId: string, quoteId = randomUUID()): OutboxMessage {
    return {
      type: 'billing.quote.revert_approval',
      workOrderId,
      payload: { quoteId, revertTo: 'SENT' },
    };
  }

  function receivedFor(workOrderId: string): MessageEnvelope<'billing.quote.revert_approval'>[] {
    return received.filter((envelope) => envelope.workOrderId === workOrderId);
  }

  function countOutbox(workOrderId: string): Promise<number> {
    return ctx.prisma.outboxMessage.count({ where: { workOrderId } });
  }

  // Holds the relay's advisory lock from another session until the returned release is called.
  async function holdRelayLock(): Promise<() => Promise<void>> {
    const client = new Client({ connectionString: ctx.postgresContainer.getConnectionUri() });
    await client.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [OUTBOX_RELAY_LOCK_KEY]);

    return async () => {
      await client.query('COMMIT');
      await client.end();
    };
  }

  it('should publish an outbox message and consume it back through a test handler', async () => {
    const workOrderId = randomUUID();
    const quoteId = randomUUID();

    const release = await holdRelayLock();

    await addMessage(revertApproval(workOrderId, quoteId));

    const row = await ctx.prisma.outboxMessage.findFirstOrThrow({ where: { workOrderId } });

    await release();

    await waitFor(() => receivedFor(workOrderId).length === 1);

    expect(receivedFor(workOrderId)[0]).toEqual({
      messageId: row.messageId,
      type: 'billing.quote.revert_approval',
      occurredAt: row.createdAt.toISOString(),
      workOrderId,
      payload: { quoteId, revertTo: 'SENT' },
    });

    expect(await countOutbox(workOrderId)).toBe(0);

    await waitFor(async () => {
      const { Attributes } = await sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
        }),
      );

      return (
        Attributes?.ApproximateNumberOfMessages === '0' &&
        Attributes?.ApproximateNumberOfMessagesNotVisible === '0'
      );
    });
  });

  it('should leave no outbox row when the transaction rolls back', async () => {
    const workOrderId = randomUUID();
    // With the relay locked out, a row that wrongly committed would still be in the table.
    const release = await holdRelayLock();

    await expect(
      unitOfWork.executeTransaction(async (repositories) => {
        await repositories.outbox.add(revertApproval(workOrderId));

        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await countOutbox(workOrderId)).toBe(0);

    await release();
  });

  it('should not publish while another transaction holds the relay lock', async () => {
    const workOrderId = randomUUID();
    const release = await holdRelayLock();

    await addMessage(revertApproval(workOrderId));

    await new Promise((resolve) => setTimeout(resolve, 2_000));

    expect(await countOutbox(workOrderId)).toBe(1);

    await release();

    await waitFor(async () => (await countOutbox(workOrderId)) === 0, 5_000);
  });

  it('should keep the group order when the first message fails', async () => {
    const workOrderId = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    failFirstDelivery.add(first);

    await unitOfWork.executeTransaction(async (repositories) => {
      await repositories.outbox.add(revertApproval(workOrderId, first));
      await repositories.outbox.add(revertApproval(workOrderId, second));
    });

    await waitFor(() => receivedFor(workOrderId).length === 3);

    expect(receivedFor(workOrderId).map(({ payload }) => payload.quoteId)).toEqual([
      first,
      first,
      second,
    ]);
  });

  it('should not acknowledge a message without handler', async () => {
    const workOrderId = randomUUID();

    const unhandledLines = () =>
      ctx
        .logCapture!.lines()
        .filter(
          (line) =>
            line['oficina.event.name'] === 'messaging.message.unhandled' &&
            line['oficina.work_order.id'] === workOrderId,
        );

    await addMessage({
      type: 'billing.payment.cancel',
      workOrderId,
      payload: { paymentId: randomUUID(), reason: 'e2e' },
    });

    await waitFor(() => unhandledLines().length >= 2);

    expect(unhandledLines()[0]).toMatchObject({ level: 'warn' });
  });

  it('should only emit declared fields on messaging lines', () => {
    const messagingLines = ctx
      .logCapture!.lines()
      .filter((line) => Object.keys(line).some((key) => key.startsWith('messaging.')));

    expect(messagingLines.length).toBeGreaterThan(0);
    expect(
      messagingLines
        .flatMap((line) => Object.keys(line))
        .filter((key) => !DECLARED_FIELD_NAMES.has(key)),
    ).toEqual([]);
  });
});
