import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CreateAppointmentRequest } from '@centro/shared';
import { IsTimeString } from '../../../../common/decorators/is-time-string.decorator';

/** Sobrecupo (CU-04): cita creada sin plantilla. */
export class CreateAppointmentDto implements CreateAppointmentRequest {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  professionalId!: string;

  @ApiProperty({ description: 'Fecha ISO 8601 (YYYY-MM-DD)' })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Formato HH:MM (24 horas)' })
  @IsTimeString()
  startTime!: string;

  @ApiProperty({ minimum: 15, maximum: 240 })
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes!: number;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
