import { createHmac } from 'node:crypto';

export interface MercadoPagoWebhookSignatureInput {
  dataId: string;
  requestId: string;
  ts: string;
  secret: string;
}

/** Builds the `x-signature` header the way Mercado Pago signs a notification. */
export function signMercadoPagoWebhook({
  dataId,
  requestId,
  ts,
  secret,
}: MercadoPagoWebhookSignatureInput): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', secret).update(manifest).digest('hex');

  return `ts=${ts},v1=${hash}`;
}
