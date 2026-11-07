import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteStatus } from '@domain/enums/quote-status.enum';
import { UserRole } from '@domain/enums/user-role.enum';
import { WorkOrderStatus } from '@application/ports/output/gateways/work-order/work-order-gateway.response';
import { PaginatedResponseDto } from '@infrastructure/http/common/dto/paginated-response.dto';
import {
  QuoteServiceItemResponse,
  QuotePartSupplyItemResponse,
  QuoteResponse,
  QuoteWithItemsResponse,
  QuoteDataResponse,
  QuoteWithItemsDataResponse,
  QuoteListResponse,
  QuotePaginatedResponse,
  QuoteWorkOrderAssignedUserResponse,
  QuoteWorkOrderCustomerResponse,
  QuoteWorkOrderResponse,
  QuoteWorkOrderVehicleResponse,
} from '@interface-adapters/quote/responses/quote.response';

export class QuoteWorkOrderCustomerResponseDto implements QuoteWorkOrderCustomerResponse {
  @ApiProperty({
    description: 'ID único do Cliente',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({ description: 'Nome do Cliente', example: 'João da Silva' })
  name!: string;

  @ApiProperty({
    enum: ['INDIVIDUAL', 'COMPANY'],
    description: 'Tipo de pessoa',
    example: 'INDIVIDUAL',
  })
  type!: string;

  @ApiProperty({ description: 'CPF ou CNPJ', example: '123.456.789-09' })
  document!: string;

  @ApiProperty({ description: 'E-mail', example: 'joao@email.com' })
  email!: string;

  @ApiProperty({ description: 'Telefone', example: '(11) 99999-9999' })
  phone!: string;
}

export class QuoteWorkOrderVehicleResponseDto implements QuoteWorkOrderVehicleResponse {
  @ApiProperty({
    description: 'ID único do Veículo',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({ description: 'Placa do veículo', example: 'ABC-1234' })
  plate!: string;

  @ApiProperty({ description: 'Marca', example: 'Toyota' })
  brand!: string;

  @ApiProperty({ description: 'Modelo', example: 'Corolla' })
  model!: string;

  @ApiProperty({ description: 'Ano de fabricação', example: 2020 })
  year!: number;

  @ApiPropertyOptional({ description: 'Cor', example: 'Prata', nullable: true })
  color!: string | null;

  @ApiPropertyOptional({ description: 'Quilometragem atual', example: 50000, nullable: true })
  mileage!: number | null;
}

export class QuoteWorkOrderAssignedUserResponseDto implements QuoteWorkOrderAssignedUserResponse {
  @ApiProperty({
    description: 'ID único do Usuário',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({ description: 'Nome do Usuário', example: 'Carlos Mecânico' })
  name!: string;

  @ApiProperty({ description: 'E-mail do Usuário', example: 'carlos@oficina.com' })
  email!: string;

  @ApiProperty({
    enum: UserRole,
    description: 'Perfil de acesso',
    example: UserRole.MECHANIC,
    nullable: true,
  })
  role!: string | null;
}

export class QuoteWorkOrderResponseDto implements QuoteWorkOrderResponse {
  @ApiProperty({
    description: 'ID único da Ordem de Serviço',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({ description: 'Número sequencial da Ordem de Serviço', example: '000001' })
  number!: string;

  @ApiProperty({
    type: QuoteWorkOrderCustomerResponseDto,
    description: 'Dados do Cliente proprietário do veículo',
  })
  customer!: QuoteWorkOrderCustomerResponseDto;

  @ApiProperty({
    type: QuoteWorkOrderVehicleResponseDto,
    description: 'Dados do Veículo em atendimento',
  })
  vehicle!: QuoteWorkOrderVehicleResponseDto;

  @ApiPropertyOptional({
    type: QuoteWorkOrderAssignedUserResponseDto,
    description: 'Mecânico responsável pela OS',
    nullable: true,
  })
  assignedUser!: QuoteWorkOrderAssignedUserResponseDto | null;

  @ApiProperty({
    enum: WorkOrderStatus,
    description: 'Status atual da Ordem de Serviço',
    example: WorkOrderStatus.RECEIVED,
  })
  status!: WorkOrderStatus;

  @ApiPropertyOptional({
    description: 'Descrição do problema relatado pelo cliente',
    example: 'Barulho ao frear',
    nullable: true,
  })
  problemDescription!: string | null;

  @ApiPropertyOptional({
    description: 'Notas internas dos mecânicos',
    example: 'Pastilhas traseiras desgastadas',
    nullable: true,
  })
  internalNotes!: string | null;

  @ApiPropertyOptional({
    description: 'Quilometragem no momento do atendimento',
    example: 52000,
    nullable: true,
  })
  mileageAtService!: number | null;

  @ApiProperty({ description: 'Valor total da Ordem de Serviço', example: 350.0 })
  totalAmount!: number;

  @ApiPropertyOptional({
    description: 'Data/hora de aprovação pelo cliente',
    example: '2026-04-21T11:00:00.000Z',
    nullable: true,
  })
  approvedAt!: string | null;

  @ApiPropertyOptional({
    description: 'Data/hora de início do atendimento',
    example: '2026-04-21T09:00:00.000Z',
    nullable: true,
  })
  startedAt!: string | null;

  @ApiPropertyOptional({
    description: 'Data/hora de conclusão',
    example: '2026-04-21T17:00:00.000Z',
    nullable: true,
  })
  finishedAt!: string | null;

  @ApiPropertyOptional({
    description: 'Data/hora de entrega do veículo',
    example: '2026-04-22T10:00:00.000Z',
    nullable: true,
  })
  deliveredAt!: string | null;

  @ApiProperty({
    description: 'Data de abertura da Ordem de Serviço',
    example: '2026-04-20T08:00:00.000Z',
    format: 'date-time',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Data da última atualização',
    example: '2026-04-21T17:00:00.000Z',
    format: 'date-time',
  })
  updatedAt!: string;
}

export class QuoteServiceItemResponseDto implements QuoteServiceItemResponse {
  @ApiProperty({
    description: 'ID do serviço',
    format: 'uuid',
    example: '4f7ce3e3-672d-472a-b2d4-a896809015e6',
  })
  id!: string;

  @ApiPropertyOptional({
    description: 'Nome do serviço',
    nullable: true,
    example: 'Troca de óleo',
  })
  name!: string | null;

  @ApiPropertyOptional({
    description: 'Descrição do serviço',
    nullable: true,
    example: 'Troca de óleo com filtro',
  })
  description!: string | null;

  @ApiProperty({ description: 'Quantidade', example: 2 })
  quantity!: number;

  @ApiProperty({ description: 'Preço unitário', example: 129.9 })
  unitPrice!: number;

  @ApiProperty({ description: 'Preço total', example: 259.8 })
  totalPrice!: number;

  @ApiProperty({ description: 'Data de criação', example: '2026-05-08T09:52:54.102-03:00' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Data de última atualização',
    example: '2026-05-08T09:52:59.754-03:00',
  })
  updatedAt!: Date;
}

export class QuotePartSupplyItemResponseDto implements QuotePartSupplyItemResponse {
  @ApiProperty({
    description: 'ID da peça/insumo',
    format: 'uuid',
    example: 'a2e1790b-fc57-4855-8749-268b6ce72d21',
  })
  id!: string;

  @ApiPropertyOptional({
    description: 'Nome da peça/insumo',
    nullable: true,
    example: 'Filtro de Óleo',
  })
  name!: string | null;

  @ApiPropertyOptional({
    description: 'Descrição detalhada',
    nullable: true,
    example: 'Filtro para motor 1.0',
  })
  description!: string | null;

  @ApiPropertyOptional({ description: 'SKU único no Estoque', nullable: true, example: 'FO-001' })
  sku!: string | null;

  @ApiPropertyOptional({
    description: 'Número de referência do fabricante',
    nullable: true,
    example: 'MANN-W712',
  })
  partNumber!: string | null;

  @ApiPropertyOptional({
    enum: ['PART', 'SUPPLY'],
    description: 'Categoria: PART (Peça) ou SUPPLY (Insumo)',
    nullable: true,
    example: 'PART',
  })
  category!: string | null;

  @ApiPropertyOptional({
    enum: ['UN', 'KG', 'L', 'ML', 'M', 'CX', 'PC', 'JG'],
    description: 'Unidade de medida',
    nullable: true,
    example: 'UN',
  })
  unit!: string | null;

  @ApiProperty({ description: 'Quantidade', example: 1 })
  quantity!: number;

  @ApiProperty({ description: 'Preço unitário', example: 45.0 })
  unitPrice!: number;

  @ApiProperty({ description: 'Preço total', example: 45.0 })
  totalPrice!: number;

  @ApiProperty({ description: 'Data de criação', example: '2026-05-08T09:51:11.226-03:00' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Data de última atualização',
    example: '2026-05-08T09:51:11.226-03:00',
  })
  updatedAt!: Date;
}

export class QuoteResponseDto implements QuoteResponse {
  @ApiProperty({
    description: 'ID do orçamento',
    format: 'uuid',
    example: 'f9b6e8e0-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  })
  id!: string;

  @ApiProperty({
    description: 'Dados da Ordem de Serviço associada',
    type: QuoteWorkOrderResponseDto,
  })
  workOrder!: QuoteWorkOrderResponseDto;

  @ApiProperty({
    description: 'Status do orçamento',
    enum: QuoteStatus,
    example: QuoteStatus.PENDING,
  })
  status!: QuoteStatus;

  @ApiPropertyOptional({
    description: 'Observações do orçamento',
    nullable: true,
    example: 'Aguardando aprovação das peças',
  })
  notes!: string | null;

  @ApiPropertyOptional({
    description: 'Data de envio ao cliente',
    nullable: true,
    example: '2023-10-27T10:00:00Z',
  })
  sentAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Data de aprovação',
    nullable: true,
    example: '2023-10-28T10:00:00Z',
  })
  approvedAt!: Date | null;

  @ApiPropertyOptional({
    description: 'Data de rejeição',
    nullable: true,
    example: '2023-10-29T10:00:00Z',
  })
  rejectedAt!: Date | null;

  @ApiProperty({ description: 'Valor total dos serviços', example: 250.5 })
  servicesAmount!: number;

  @ApiProperty({ description: 'Valor total das peças', example: 120.0 })
  partsAmount!: number;

  @ApiProperty({ description: 'Valor total do orçamento', example: 370.5 })
  totalAmount!: number;

  @ApiProperty({ description: 'Data de criação', example: '2023-10-27T10:00:00Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Data de última atualização', example: '2023-10-28T10:00:00Z' })
  updatedAt!: Date;
}

export class QuoteWithItemsResponseDto extends QuoteResponseDto implements QuoteWithItemsResponse {
  @ApiProperty({ description: 'Lista de serviços incluídos', type: [QuoteServiceItemResponseDto] })
  services!: QuoteServiceItemResponseDto[];

  @ApiProperty({
    description: 'Lista de peças/insumos incluídos',
    type: [QuotePartSupplyItemResponseDto],
  })
  partsSupplies!: QuotePartSupplyItemResponseDto[];
}

export class QuoteDataResponseDto implements QuoteDataResponse {
  @ApiProperty({ type: QuoteResponseDto })
  data!: QuoteResponseDto;
}

export class QuoteWithItemsDataResponseDto implements QuoteWithItemsDataResponse {
  @ApiProperty({ type: QuoteWithItemsResponseDto })
  data!: QuoteWithItemsResponseDto;
}

export class QuoteListResponseDto implements QuoteListResponse {
  @ApiProperty({ type: [QuoteResponseDto] })
  data!: QuoteResponseDto[];
}

export class QuotePaginatedResponseDto
  extends PaginatedResponseDto<QuoteResponseDto>
  implements QuotePaginatedResponse
{
  @ApiProperty({ type: [QuoteResponseDto] })
  data!: QuoteResponseDto[];
}
