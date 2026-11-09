import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureValidator } from 'mercadopago';

import { AuthenticationFailedException } from '@infrastructure/exceptions/authentication-failed.exception';
import { MercadoPagoSignatureGuard } from '@infrastructure/http/guards/mercado-pago-signature.guard';
import { TECHNICAL_EVENTS } from '@infrastructure/logging/technical-event.catalog';

import { createMockLogger } from '../../../../helpers/logger-mock.factory';
import { signMercadoPagoWebhook } from '../../../../helpers/mercado-pago-webhook.helper';

const SECRET = 'test-webhook-secret';
const REQUEST_ID = 'b5c2e1f0-request';
const TS = '1762700000';

interface WebhookRequest {
  headers: Record<string, string | undefined>;
  query: Record<string, unknown>;
}

function buildContext(request: WebhookRequest): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('MercadoPagoSignatureGuard', () => {
  let metricReader: PeriodicExportingMetricReader;
  let meterProvider: MeterProvider;
  let logger: ReturnType<typeof createMockLogger>;
  let guard: MercadoPagoSignatureGuard;

  beforeAll(() => {
    metricReader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.DELTA),
      exportIntervalMillis: 600_000,
    });

    meterProvider = new MeterProvider({ readers: [metricReader] });

    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterAll(async () => {
    await meterProvider.shutdown();
    metrics.disable();
  });

  beforeEach(async () => {
    await metricReader.collect();
    logger = createMockLogger();

    guard = new MercadoPagoSignatureGuard(
      new ConfigService({ MERCADOPAGO_WEBHOOK_SECRET: SECRET }),
      logger,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function receivedCounts(): Promise<Record<string, number>> {
    const { resourceMetrics } = await metricReader.collect();

    const metric = resourceMetrics.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .find((candidate) => candidate.descriptor.name === 'oficina.payment.webhook.received');

    const counts: Record<string, number> = {};

    for (const point of metric?.dataPoints ?? []) {
      counts[point.attributes.outcome as string] = point.value as number;
    }

    return counts;
  }

  it('should accept a valid signature, log the notification and count it as valid', async () => {
    const signature = signMercadoPagoWebhook({
      dataId: 'ord000001',
      requestId: REQUEST_ID,
      ts: TS,
      secret: SECRET,
    });

    const context = buildContext({
      headers: { 'x-signature': signature, 'x-request-id': REQUEST_ID },
      query: { 'data.id': 'ord000001', type: 'order' },
    });

    expect(guard.canActivate(context)).toBe(true);

    expect(logger.event).toHaveBeenCalledWith(TECHNICAL_EVENTS.PAYMENT_WEBHOOK_RECEIVED, {
      checkoutId: 'ord000001',
    });

    expect(await receivedCounts()).toEqual({ valid: 1 });
  });

  it('should validate the signature with the data id in lowercase', () => {
    const signature = signMercadoPagoWebhook({
      dataId: 'ORD000001',
      requestId: REQUEST_ID,
      ts: TS,
      secret: SECRET,
    });

    const context = buildContext({
      headers: { 'x-signature': signature, 'x-request-id': REQUEST_ID },
      query: { 'data.id': 'ORD000001', type: 'order' },
    });

    expect(guard.canActivate(context)).toBe(true);

    expect(logger.event).toHaveBeenCalledWith(TECHNICAL_EVENTS.PAYMENT_WEBHOOK_RECEIVED, {
      checkoutId: 'ORD000001',
    });
  });

  it.each([
    ['a mismatched signature', `ts=${TS},v1=${'0'.repeat(64)}`, 'SignatureMismatch'],
    ['a missing ts', `v1=${'0'.repeat(64)}`, 'MissingTimestamp'],
    ['a missing header', undefined, 'MissingSignatureHeader'],
  ])(
    'should answer 401 for %s, log the reason and count it as invalid',
    async (_case, signature, reason) => {
      const context = buildContext({
        headers: { 'x-signature': signature, 'x-request-id': REQUEST_ID },
        query: { 'data.id': 'ORD000001', type: 'order' },
      });

      expect(() => guard.canActivate(context)).toThrow(
        new AuthenticationFailedException('Assinatura do webhook inválida'),
      );

      expect(logger.event).toHaveBeenCalledWith(
        TECHNICAL_EVENTS.PAYMENT_WEBHOOK_INVALID_SIGNATURE,
        {
          signatureFailureReason: reason,
        },
      );

      expect(await receivedCounts()).toEqual({ invalid_signature: 1 });
    },
  );

  it('should answer 401 for a repeated data id', () => {
    const signature = signMercadoPagoWebhook({
      dataId: 'ORD000001',
      requestId: REQUEST_ID,
      ts: TS,
      secret: SECRET,
    });

    const context = buildContext({
      headers: { 'x-signature': signature, 'x-request-id': REQUEST_ID },
      query: { 'data.id': ['ORD000001', 'ORD000002'], type: 'order' },
    });

    expect(() => guard.canActivate(context)).toThrow(AuthenticationFailedException);

    expect(logger.event).toHaveBeenCalledWith(TECHNICAL_EVENTS.PAYMENT_WEBHOOK_INVALID_SIGNATURE, {
      signatureFailureReason: 'SignatureMismatch',
    });
  });

  it('should rethrow a failure that is not a signature error', async () => {
    const failure = new TypeError('unexpected');

    jest.spyOn(WebhookSignatureValidator, 'validate').mockImplementation(() => {
      throw failure;
    });

    const context = buildContext({
      headers: { 'x-signature': `ts=${TS},v1=abc`, 'x-request-id': REQUEST_ID },
      query: { 'data.id': 'ORD000001' },
    });

    expect(() => guard.canActivate(context)).toThrow(failure);
    expect(logger.event).not.toHaveBeenCalled();
    expect(await receivedCounts()).toEqual({});
  });
});
