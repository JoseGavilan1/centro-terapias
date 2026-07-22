import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Specialty, UserRole, UsersQuery } from '@centro/shared';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class QueryUsersDto extends PaginationQueryDto implements UsersQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: Specialty })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}
