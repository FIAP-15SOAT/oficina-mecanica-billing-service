import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { UserRole } from '@domain/enums/user-role.enum';
import { Roles } from '@infrastructure/http/decorators/roles.decorator';
import { RolesGuard } from '@infrastructure/http/guards/roles.guard';
import { PaymentController as PaymentCleanController } from '@interface-adapters/payment/payment.controller';

import { CreatePaymentRequestDto } from './dto/requests/create-payment-request.dto';
import { FindAllPaymentsQueryDto } from './dto/requests/find-all-payments-query.dto';
import {
  PaymentDataResponseDto,
  PaymentPaginatedResponseDto,
} from './dto/responses/payment-response.dto';

@ApiTags('Cobranças')
@ApiProduces('application/json')
@ApiInternalServerErrorResponse({ description: 'Erro interno do servidor' })
@Controller('payments')
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class PaymentController {
  constructor(private readonly controller: PaymentCleanController) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MECHANIC, UserRole.ATTENDANT)
  @ApiOperation({ summary: 'Listar cobranças paginado' })
  @ApiOkResponse({ type: PaymentPaginatedResponseDto })
  @ApiBadRequestResponse({ description: 'Filtros ou paginação inválidos' })
  @ApiUnauthorizedResponse({ description: 'Não autenticado' })
  @ApiForbiddenResponse({ description: 'Acesso negado' })
  findAll(@Query() query: FindAllPaymentsQueryDto): Promise<PaymentPaginatedResponseDto> {
    return this.controller.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MECHANIC, UserRole.ATTENDANT)
  @ApiOperation({ summary: 'Criar cobrança no Mercado Pago para Ordem de Serviço' })
  @ApiCreatedResponse({
    type: PaymentDataResponseDto,
    description: 'Cobrança criada com o link de pagamento',
  })
  @ApiBadRequestResponse({ description: 'Dados de entrada inválidos' })
  @ApiUnauthorizedResponse({ description: 'Não autenticado' })
  @ApiForbiddenResponse({ description: 'Acesso negado' })
  @ApiNotFoundResponse({ description: 'Ordem de Serviço não encontrada' })
  @ApiConflictResponse({
    description: 'Ordem de Serviço fora dos status permitidos ou com cobrança pendente',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Valor menor ou igual a zero ou acima do saldo da Ordem de Serviço',
  })
  @ApiServiceUnavailableResponse({ description: 'Work Order ou Mercado Pago indisponível' })
  create(@Body() request: CreatePaymentRequestDto): Promise<PaymentDataResponseDto> {
    return this.controller.create(request);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC, UserRole.ATTENDANT)
  @ApiOperation({ summary: 'Buscar cobrança por ID' })
  @ApiOkResponse({ type: PaymentDataResponseDto, description: 'Cobrança encontrada' })
  @ApiBadRequestResponse({ description: 'ID inválido' })
  @ApiUnauthorizedResponse({ description: 'Não autenticado' })
  @ApiForbiddenResponse({ description: 'Acesso negado' })
  @ApiNotFoundResponse({ description: 'Cobrança não encontrada' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'ID da cobrança' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentDataResponseDto> {
    return this.controller.findOne(id);
  }
}
