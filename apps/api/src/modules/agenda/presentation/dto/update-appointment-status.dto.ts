import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AppointmentStatus, UpdateAppointmentStatusRequest } from '@centro/shared';

/** CU-05: confirmar o cancelar (solo ADMIN). Los estados de asistencia se gestionan por MarkAttendanceDto. */
export class UpdateAppointmentStatusDto implements UpdateAppointmentStatusRequest {
  @ApiProperty({ enum: [AppointmentStatus.CONFIRMADA, AppointmentStatus.CANCELADA] })
  @IsIn([AppointmentStatus.CONFIRMADA, AppointmentStatus.CANCELADA])
  status!: AppointmentStatus.CONFIRMADA | AppointmentStatus.CANCELADA;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
