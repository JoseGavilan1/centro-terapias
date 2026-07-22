import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { IncidentStatus, UpdateIncidentStatusRequest } from '@centro/shared';

/** No incluye tipo/descripción/paciente/fecha: el reporte original nunca se modifica (§1.3). */
export class UpdateIncidentStatusDto implements UpdateIncidentStatusRequest {
  @ApiProperty({ enum: IncidentStatus })
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;
}
