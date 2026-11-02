import { Module } from '@nestjs/common';

import { QuoteModule } from '@infrastructure/http/controllers/quote/quote.module';

import { InternalQuoteController } from './internal-quote.controller';

@Module({
  imports: [QuoteModule],
  controllers: [InternalQuoteController],
})
export class InternalModule {}
