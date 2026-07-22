import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CreateIncidentRequest, IncidentType } from '@centro/shared';
import { IsNotFutureDate } from '../../../../common/decorators/is-not-future-date.decorator';

export class CreateIncidentDto implements CreateIncidentRequest {
  @ApiPropertyOptional({ description: 'Opcional: el incidente puede no involucrar a un paciente' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiProperty({ enum: IncidentType })
  @IsEnum(IncidentType)
  type!: IncidentType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ description: 'Fecha y hora ISO 8601; no puede ser futura' })
  @IsNotFutureDate()
  occurredAt!: string;
}
