import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenerateAppointmentsResult, Paginated, TherapySlotDto, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { AppointmentsService } from '../application/appointments.service';
import { TherapySlotsService } from '../application/therapy-slots.service';
import { CreateTherapySlotDto } from './dto/create-therapy-slot.dto';
import { GenerateAppointmentsDto } from './dto/generate-appointments.dto';
import { QueryTherapySlotsDto } from './dto/query-therapy-slots.dto';
import { UpdateTherapySlotDto } from './dto/update-therapy-slot.dto';

@ApiTags('therapy-slots')
@ApiBearerAuth()
@Controller('therapy-slots')
export class TherapySlotsController {
  constructor(
    private readonly therapySlotsService: TherapySlotsService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar plantillas de horario (ADMIN: todas; PROFESSIONAL: solo las propias)',
  })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryTherapySlotsDto,
  ): Promise<Paginated<TherapySlotDto>> {
    return this.therapySlotsService.findMany(user.organizationId, user, query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear plantilla de horario fijo' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTherapySlotDto,
    @ReqContext() context: RequestContext,
  ): Promise<TherapySlotDto> {
    return this.therapySlotsService.create(user.organizationId, dto, user, context);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar una plantilla de horario' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTherapySlotDto,
    @ReqContext() context: RequestContext,
  ): Promise<TherapySlotDto> {
    return this.therapySlotsService.update(user.organizationId, id, dto, user, context);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar plantilla (no borra Appointment ya generados)' })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @ReqContext() context: RequestContext,
  ): Promise<void> {
    await this.therapySlotsService.deactivate(user.organizationId, id, user, context);
  }

  @Post('generate-appointments')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar instancias de Appointment para un rango de fechas (idempotente)',
  })
  generateAppointments(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateAppointmentsDto,
    @ReqContext() context: RequestContext,
  ): Promise<GenerateAppointmentsResult> {
    return this.appointmentsService.generateAppointments(user.organizationId, dto, user, context);
  }
}
