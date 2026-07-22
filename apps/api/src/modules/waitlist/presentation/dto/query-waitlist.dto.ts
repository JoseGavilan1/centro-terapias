import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Specialty, WaitlistQuery, WaitlistStatus } from '@centro/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class QueryWaitlistDto extends PaginationQueryDto implements WaitlistQuery {
  @ApiPropertyOptional({ enum: WaitlistStatus })
  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;

  @ApiPropertyOptional({ enum: Specialty })
  @IsOptional()
  @IsEnum(Specialty)
  requestedSpecialty?: Specialty;
}
