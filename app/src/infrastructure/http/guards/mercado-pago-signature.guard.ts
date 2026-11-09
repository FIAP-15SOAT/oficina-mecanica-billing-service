import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter, metrics } from '@opentelemetry/api';
import type { Request } from 'express';
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

import { ILogger } from '@application/ports/output/services/logger.service.interface';
import { AuthenticationFailedException } from '@infrastructure/exceptions/authentication-failed.exception';
import { ServiceIntegrationException } from '@infrastructure/exceptions/service-integration.exception';
import { TECHNICAL_EVENTS } from '@infrastructure/logging/technical-event.catalog';

type WebhookOutcome = 'valid' | 'invalid_signature';

@Injectable()
export class MercadoPagoSignatureGuard implements CanActivate {
  private readonly webhookSecret: string;
  private readonly receivedWebhooksCounterMetric: Counter;

  constructor(
    config: ConfigService,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {
    this.webhookSecret = config.getOrThrow<string>('MERCADOPAGO_WEBHOOK_SECRET');

    this.receivedWebhooksCounterMetric = metrics
      .getMeter('oficina.payments')
      .createCounter('oficina.payment.webhook.received', { unit: '{notification}' });
  }

  canActivate(context: ExecutionContext): boolean {
    // An empty key would accept any signature computed with an empty key too.
    if (!this.webhookSecret) {
      throw new ServiceIntegrationException('Webhook do Mercado Pago não configurado');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const dataId = request.query['data.id'];
    // A repeated parameter arrives as an array; it is left out of the manifest, so it fails the check.
    const checkoutId = typeof dataId === 'string' ? dataId : undefined;

    try {
      WebhookSignatureValidator.validate({
        xSignature: request.headers['x-signature'],
        xRequestId: request.headers['x-request-id'],
        // Order notifications are signed over the id as sent, not lowercased as the generic guide says.
        dataId: checkoutId,
        secret: this.webhookSecret,
      });
    } catch (error) {
      throw this.handleValidationFailure(error);
    }

    this.logger.event(TECHNICAL_EVENTS.PAYMENT_WEBHOOK_RECEIVED, { checkoutId });
    this.recordWebhookOutcome('valid');

    return true;
  }

  private handleValidationFailure(error: unknown): unknown {
    if (!(error instanceof InvalidWebhookSignatureError)) {
      return error;
    }

    this.logger.event(TECHNICAL_EVENTS.PAYMENT_WEBHOOK_INVALID_SIGNATURE, {
      signatureFailureReason: error.reason,
    });

    this.recordWebhookOutcome('invalid_signature');

    return new AuthenticationFailedException('Assinatura do webhook inválida');
  }

  private recordWebhookOutcome(outcome: WebhookOutcome): void {
    this.receivedWebhooksCounterMetric.add(1, { outcome });
  }
}
