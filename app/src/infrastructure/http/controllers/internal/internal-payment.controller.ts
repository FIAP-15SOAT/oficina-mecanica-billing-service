import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '@infrastructure/http/decorators/public.decorator';
import { INTERNAL_PREFIX } from '@infrastructure/http/http.constants';

import { InternalPaymentController as InternalPaymentCleanController } from '@interface-adapters/payment/internal-payment.controller';
import {
  InternalPaymentListResponse,
  InternalWorkOrderBalanceDataResponse,
} from '@interface-adapters/payment/responses/internal-payment.response';

@ApiExcludeController()
@Public()
@Controller(INTERNAL_PREFIX)
export class InternalPaymentController {
  constructor(private readonly controller: InternalPaymentCleanController) {}

  @Get('work-orders/:workOrderId/payments')
  findWorkOrderPayments(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
  ): Promise<InternalPaymentListResponse> {
    return this.controller.findWorkOrderPayments(workOrderId);
  }

  @Get('work-orders/:workOrderId/balance')
  findWorkOrderBalance(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
  ): Promise<InternalWorkOrderBalanceDataResponse> {
    return this.controller.findWorkOrderBalance(workOrderId);
  }
}
