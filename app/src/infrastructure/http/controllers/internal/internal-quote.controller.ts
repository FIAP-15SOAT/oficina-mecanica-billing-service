import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '@infrastructure/http/decorators/public.decorator';
import { INTERNAL_PREFIX } from '@infrastructure/http/http.constants';
import { CreateQuoteRequestDto } from '@infrastructure/http/controllers/quote/dto/requests/create-quote-request.dto';

import { InternalQuoteController as InternalQuoteCleanController } from '@interface-adapters/quote/internal-quote.controller';
import {
  InternalQuoteDataResponse,
  InternalQuoteListResponse,
  InternalQuoteWithItemsDataResponse,
} from '@interface-adapters/quote/responses/internal-quote.response';

import { DecideQuoteRequestDto } from './dto/requests/decide-quote-request.dto';

@ApiExcludeController()
@Public()
@Controller(INTERNAL_PREFIX)
export class InternalQuoteController {
  constructor(private readonly controller: InternalQuoteCleanController) {}

  @Post('quotes')
  createInitial(@Body() request: CreateQuoteRequestDto): Promise<InternalQuoteDataResponse> {
    return this.controller.createInitial(request);
  }

  @Delete('quotes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.controller.delete(id);
  }

  @Get('quotes/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InternalQuoteWithItemsDataResponse> {
    return this.controller.findOne(id);
  }

  @Get('work-orders/:workOrderId/quotes')
  findWorkOrderQuotes(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
  ): Promise<InternalQuoteListResponse> {
    return this.controller.findWorkOrderQuotes(workOrderId);
  }

  @Post('quotes/:id/decisions')
  @HttpCode(HttpStatus.OK)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() request: DecideQuoteRequestDto,
  ): Promise<InternalQuoteWithItemsDataResponse> {
    return this.controller.decide(id, request);
  }
}
