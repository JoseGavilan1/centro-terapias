import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IncidentDto, Paginated, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { IncidentsService } from '../application/incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';

@ApiTags('incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar incidencias (ADMIN: todas; PROFESSIONAL: solo las que reportó)',
  })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryIncidentsDto,
  ): Promise<Paginated<IncidentDto>> {
    return this.incidentsService.findMany(user.organizationId, user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una incidencia por id' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<IncidentDto> {
    return this.incidentsService.findOne(user.organizationId, user, id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Reportar una incidencia (violencia, abuso, accidente, situación grave); notifica de inmediato al administrador',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentDto,
    @ReqContext() context: RequestContext,
  ): Promise<IncidentDto> {
    return this.incidentsService.create(user.organizationId, dto, user, context);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar el estado de seguimiento (el reporte original no cambia)' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @ReqContext() context: RequestContext,
  ): Promise<IncidentDto> {
    return this.incidentsService.updateStatus(user.organizationId, id, dto, user, context);
  }
}
