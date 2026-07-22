import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { TherapySlotsQuery } from '@centro/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class QueryTherapySlotsDto extends PaginationQueryDto implements TherapySlotsQuery {
  @ApiPropertyOptional({ description: 'Ignorado si el actor es PROFESSIONAL' })
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;
}
