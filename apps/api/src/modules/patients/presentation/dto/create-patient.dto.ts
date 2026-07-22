import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeRut, CreatePatientRequest } from '@centro/shared';
import { IsChileanRut } from '../../../../common/decorators/is-chilean-rut.decorator';
import { IsNotFutureDate } from '../../../../common/decorators/is-not-future-date.decorator';

export class CreatePatientDto implements CreatePatientRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ description: 'Con o sin puntos; se normaliza a "XXXXXXXX-Y"' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? normalizeRut(value) : value))
  @IsChileanRut()
  rut!: string;

  @ApiProperty({ description: 'Fecha ISO 8601 (YYYY-MM-DD), no puede ser futura' })
  @IsNotFutureDate()
  birthDate!: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  diagnosis?: string;

  @ApiProperty({ description: 'WhatsApp del apoderado' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}
