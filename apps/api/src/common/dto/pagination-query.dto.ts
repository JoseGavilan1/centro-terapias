import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PageQuery } from '@centro/shared';

/**
 * Campos `page`/`pageSize` comunes a todo listado paginado. Los DTOs de
 * query de cada módulo extienden esta clase en vez de repetir los mismos
 * decoradores (evita que los límites diverjan entre endpoints sin razón).
 */
export class PaginationQueryDto implements PageQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_PAGE_SIZE, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
