import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { AttendanceReportQuery } from '@centro/shared';

export class AttendanceReportQueryDto implements AttendanceReportQuery {
  @ApiPropertyOptional({
    description: 'Fecha ISO 8601 (YYYY-MM-DD); default: primer día del mes actual',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fecha ISO 8601 (YYYY-MM-DD), inclusive; default: hoy' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
