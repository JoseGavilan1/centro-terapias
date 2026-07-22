import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_MONTHLY_REPORT_MONTHS, MonthlyReportQuery } from '@centro/shared';

export class MonthlyReportQueryDto implements MonthlyReportQuery {
  @ApiPropertyOptional({ default: 6, maximum: MAX_MONTHLY_REPORT_MONTHS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MONTHLY_REPORT_MONTHS)
  months?: number;
}
