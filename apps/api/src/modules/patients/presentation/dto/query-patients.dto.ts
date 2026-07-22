import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PatientsQuery } from '@centro/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class QueryPatientsDto extends PaginationQueryDto implements PatientsQuery {
  @ApiPropertyOptional({ description: 'Busca por nombre, apellido o RUT' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}
