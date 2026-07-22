import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppointmentDto, Paginated, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { AppointmentsService } from '../application/appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar citas (ADMIN: todas; PROFESSIONAL: solo las propias)' })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryAppointmentsDto,
  ): Promise<Paginated<AppointmentDto>> {
    return this.appointmentsService.findMany(user.organizationId, user, query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar un sobrecupo (cita sin plantilla)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
    @ReqContext() context: RequestContext,
  ): Promise<AppointmentDto> {
    return this.appointmentsService.create(user.organizationId, dto, user, context);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Confirmar o cancelar una cita' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @ReqContext() context: RequestContext,
  ): Promise<AppointmentDto> {
    return this.appointmentsService.updateStatus(user.organizationId, id, dto, user, context);
  }

  @Patch(':id/attendance')
  @ApiOperation({
    summary: 'Marcar asistencia (PROFESSIONAL: propias, hoy o pasado; ADMIN: sin restricción)',
  })
  markAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkAttendanceDto,
    @ReqContext() context: RequestContext,
  ): Promise<AppointmentDto> {
    return this.appointmentsService.markAttendance(user.organizationId, id, dto, user, context);
  }
}
