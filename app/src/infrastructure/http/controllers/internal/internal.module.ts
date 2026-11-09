import { Module } from '@nestjs/common';

import { PaymentModule } from '@infrastructure/http/controllers/payment/payment.module';
import { QuoteModule } from '@infrastructure/http/controllers/quote/quote.module';

import { InternalPaymentController } from './internal-payment.controller';
import { InternalQuoteController } from './internal-quote.controller';

@Module({
  imports: [QuoteModule, PaymentModule],
  controllers: [InternalQuoteController, InternalPaymentController],
})
export class InternalModule {}
