import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AppointmentStatus, MarkAttendanceRequest } from '@centro/shared';

/** CU-06: marcar asistencia (PROFESSIONAL sobre sus propias citas, o ADMIN sin restricción). */
export class MarkAttendanceDto implements MarkAttendanceRequest {
  @ApiProperty({
    enum: [AppointmentStatus.ATENDIDA, AppointmentStatus.NO_ASISTIO, AppointmentStatus.CANCELADA],
  })
  @IsIn([AppointmentStatus.ATENDIDA, AppointmentStatus.NO_ASISTIO, AppointmentStatus.CANCELADA])
  status!: AppointmentStatus.ATENDIDA | AppointmentStatus.NO_ASISTIO | AppointmentStatus.CANCELADA;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
