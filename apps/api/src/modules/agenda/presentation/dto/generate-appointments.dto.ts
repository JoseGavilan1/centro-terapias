import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { GenerateAppointmentsRequest } from '@centro/shared';

export class GenerateAppointmentsDto implements GenerateAppointmentsRequest {
  @ApiProperty({ description: 'Fecha ISO 8601 (YYYY-MM-DD)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Fecha ISO 8601 (YYYY-MM-DD); rango máximo de 60 días' })
  @IsDateString()
  to!: string;
}
