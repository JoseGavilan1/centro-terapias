import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeRut, UpdatePatientRequest } from '@centro/shared';
import { IsChileanRut } from '../../../../common/decorators/is-chilean-rut.decorator';
import { IsNotFutureDate } from '../../../../common/decorators/is-not-future-date.decorator';

export class UpdatePatientDto implements UpdatePatientRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Con o sin puntos; se normaliza a "XXXXXXXX-Y"' })
  @IsOptional()
  @Transform(({ value }: { value: string | undefined }) => (typeof value === 'string' ? normalizeRut(value) : value))
  @IsChileanRut()
  rut?: string;

  @ApiPropertyOptional({ description: 'Fecha ISO 8601 (YYYY-MM-DD), no puede ser futura' })
  @IsOptional()
  @IsNotFutureDate()
  birthDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  diagnosis?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
