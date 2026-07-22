import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction, AuditLogsQuery } from '@centro/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class QueryAuditLogsDto extends PaginationQueryDto implements AuditLogsQuery {
  @ApiPropertyOptional({ description: 'Entidad afectada, p. ej. "User"' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'Fecha ISO 8601 desde' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Fecha ISO 8601 hasta' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
