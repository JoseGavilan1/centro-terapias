import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeRut, Specialty, UpdateWaitlistEntryRequest } from '@centro/shared';
import { IsChileanRut } from '../../../../common/decorators/is-chilean-rut.decorator';
import { IsNotFutureDate } from '../../../../common/decorators/is-not-future-date.decorator';

/** Solo aplicable mientras la entrada sigue PENDIENTE (§3 CU-06). No incluye `status`: eso lo cambian `assign`/`discard`. */
export class UpdateWaitlistEntryDto implements UpdateWaitlistEntryRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  childFirstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  childLastName?: string;

  @ApiPropertyOptional({ description: 'Con o sin puntos; se normaliza a "XXXXXXXX-Y"' })
  @Transform(({ value }: { value: string | undefined }) =>
    typeof value === 'string' && value !== '' ? normalizeRut(value) : undefined,
  )
  @IsOptional()
  @IsChileanRut()
  childRut?: string;

  @ApiPropertyOptional({ description: 'Fecha ISO 8601 (YYYY-MM-DD), no puede ser futura' })
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsNotFutureDate()
  childBirthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  guardianPhone?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsEmail()
  guardianEmail?: string;

  @ApiPropertyOptional({ enum: Specialty })
  @IsOptional()
  @IsEnum(Specialty)
  requestedSpecialty?: Specialty;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sede?: string;
}
