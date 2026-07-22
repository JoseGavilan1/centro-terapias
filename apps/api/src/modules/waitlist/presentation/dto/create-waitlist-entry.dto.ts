import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CreateWaitlistEntryRequest, normalizeRut, Specialty } from '@centro/shared';
import { IsChileanRut } from '../../../../common/decorators/is-chilean-rut.decorator';
import { IsNotFutureDate } from '../../../../common/decorators/is-not-future-date.decorator';

/**
 * Cuerpo compartido por el webhook de intake (`POST /webhooks/waitlist`) y el ingreso manual
 * (`POST /waitlist`, ADMIN) — mismo contrato, mismo resultado (§3 CU-01/CU-02).
 */
export class CreateWaitlistEntryDto implements CreateWaitlistEntryRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  childFirstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  childLastName!: string;

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

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  guardianName!: string;

  @ApiProperty({ description: 'WhatsApp del apoderado' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  guardianPhone!: string;

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
}
