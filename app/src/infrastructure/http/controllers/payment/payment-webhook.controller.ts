import { Controller, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '@infrastructure/http/decorators/public.decorator';
import { MercadoPagoSignatureGuard } from '@infrastructure/http/guards/mercado-pago-signature.guard';
import { WEBHOOKS_PREFIX } from '@infrastructure/http/http.constants';
import { PaymentWebhookController as PaymentWebhookCleanController } from '@interface-adapters/payment/payment-webhook.controller';

@ApiExcludeController()
@Public()
@Controller(`${WEBHOOKS_PREFIX}/mercadopago`)
@UseGuards(MercadoPagoSignatureGuard)
export class PaymentWebhookController {
  constructor(private readonly controller: PaymentWebhookCleanController) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  receive(@Query('data.id') checkoutId: string): Promise<void> {
    return this.controller.receive(checkoutId);
  }
}
