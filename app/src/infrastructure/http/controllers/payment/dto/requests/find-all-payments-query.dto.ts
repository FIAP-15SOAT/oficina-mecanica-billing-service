import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaymentStatus } from '@domain/enums/payment-status.enum';
import { PaginationDto } from '@infrastructure/http/common/dto/pagination.dto';

class FilterPaymentsDto {
  @ApiPropertyOptional({ description: 'Filtrar por ID da Ordem de Serviço', format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'O ID da ordem de serviço deve ser um UUID válido' })
  workOrderId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por status', enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus, {
    message: `Status deve ser um dos seguintes: ${Object.values(PaymentStatus).join(', ')}`,
  })
  status?: PaymentStatus;
}

export class FindAllPaymentsQueryDto extends IntersectionType(PaginationDto, FilterPaymentsDto) {}
