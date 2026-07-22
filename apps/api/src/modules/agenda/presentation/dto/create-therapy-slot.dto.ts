import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CreateTherapySlotRequest, Weekday } from '@centro/shared';
import { IsTimeString } from '../../../../common/decorators/is-time-string.decorator';

export class CreateTherapySlotDto implements CreateTherapySlotRequest {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

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

  @ApiPropertyOptional({
    description: 'Fecha ISO 8601 (YYYY-MM-DD); si se envía, debe ser >= validFrom',
  })
  @IsOptional()
  @IsDateString()
  validTo?: string;
}
