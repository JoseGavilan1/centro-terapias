import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { UpdateTherapySlotRequest, Weekday } from '@centro/shared';
import { IsTimeString } from '../../../../common/decorators/is-time-string.decorator';

export class UpdateTherapySlotDto implements UpdateTherapySlotRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @ApiPropertyOptional({ enum: Weekday })
  @IsOptional()
  @IsEnum(Weekday)
  weekday?: Weekday;

  @ApiPropertyOptional({ description: 'Formato HH:MM (24 horas)' })
  @IsOptional()
  @IsTimeString()
  startTime?: string;

  @ApiPropertyOptional({ minimum: 15, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Fecha ISO 8601 (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({
    description: 'Fecha ISO 8601 (YYYY-MM-DD); null limpia la fecha de término',
    nullable: true,
  })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @ApiPropertyOptional({ description: 'Reactivar/desactivar sin pasar por DELETE' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
