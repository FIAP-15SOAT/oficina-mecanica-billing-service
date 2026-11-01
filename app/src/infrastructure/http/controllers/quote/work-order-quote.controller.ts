import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { RolesGuard } from '@infrastructure/http/guards/roles.guard';
import { Roles } from '@infrastructure/http/decorators/roles.decorator';
import { UserRole } from '@domain/enums/user-role.enum';

import { QuoteController as QuoteCleanController } from '@interface-adapters/quote/quote.controller';

import { QuoteListResponseDto } from './dto/responses/quote-response.dto';

@ApiTags('Gestão de Orçamentos')
@ApiProduces('application/json')
@ApiInternalServerErrorResponse({ description: 'Erro interno do servidor' })
@Controller('work-orders')
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class WorkOrderQuoteController {
  constructor(private readonly controller: QuoteCleanController) {}

  @Get(':id/quotes')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC, UserRole.ATTENDANT)
  @ApiOperation({ summary: 'Listar orçamentos de uma Ordem de Serviço' })
  @ApiOkResponse({ type: QuoteListResponseDto, description: 'Lista de orçamentos' })
  @ApiNotFoundResponse({ description: 'Ordem de Serviço não encontrada' })
  @ApiServiceUnavailableResponse({ description: 'Work Order indisponível' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findQuotes(@Param('id', ParseUUIDPipe) id: string): Promise<QuoteListResponseDto> {
    return this.controller.findWorkOrderQuotes(id);
  }
}
