import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AssignWaitlistEntryRequest, normalizeRut, Weekday } from '@centro/shared';
import { IsChileanRut } from '../../../../common/decorators/is-chilean-rut.decorator';
import { IsNotFutureDate } from '../../../../common/decorators/is-not-future-date.decorator';
import { IsTimeString } from '../../../../common/decorators/is-time-string.decorator';

export class AssignWaitlistEntryDto implements AssignWaitlistEntryRequest {
  @ApiProperty()
  @IsUUID()
  professionalId!: string;

  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  weekday!: Weekday;

  @ApiProperty({ description: 'Formato HH:MM (24 horas)' })
  @IsTimeString()
  startTime!: string;

  @ApiProperty({ minimum: 15, maximum: 240 })
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes!: number;

  @ApiProperty({ description: 'Fecha ISO 8601 (YYYY-MM-DD)' })
  @IsDateString()
  validFrom!: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sede?: string;

  @ApiPropertyOptional({
    description: 'Obligatorio si la entrada no trae childRut (validado en el servicio)',
  })
  @Transform(({ value }: { value: string | undefined }) =>
    typeof value === 'string' && value !== '' ? normalizeRut(value) : undefined,
  )
  @IsOptional()
  @IsChileanRut()
  rut?: string;

  @ApiPropertyOptional({
    description: 'Fecha ISO 8601 (YYYY-MM-DD); obligatorio si la entrada no trae childBirthDate',
  })
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsNotFutureDate()
  birthDate?: string;
}
