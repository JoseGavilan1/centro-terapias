import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Paginated, UserRole, WaitlistEntryDto } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { WaitlistService } from '../application/waitlist.service';
import { AssignWaitlistEntryDto } from './dto/assign-waitlist-entry.dto';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { DiscardWaitlistEntryDto } from './dto/discard-waitlist-entry.dto';
import { QueryWaitlistDto } from './dto/query-waitlist.dto';
import { UpdateWaitlistEntryDto } from './dto/update-waitlist-entry.dto';

@ApiTags('waitlist')
@ApiBearerAuth()
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar/filtrar la lista de espera (pendientes primero)' })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryWaitlistDto,
  ): Promise<Paginated<WaitlistEntryDto>> {
    return this.waitlistService.findMany(user.organizationId, query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar una entrada manualmente (consulta telefónica, presencial, etc.)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWaitlistEntryDto,
    @ReqContext() context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    return this.waitlistService.create(user.organizationId, dto, user, context);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar una entrada (solo mientras esté PENDIENTE)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWaitlistEntryDto,
    @ReqContext() context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    return this.waitlistService.update(user.organizationId, id, dto, user, context);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Asignar terapeuta/horario: crea Patient + TherapySlot y marca ASIGNADA' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignWaitlistEntryDto,
    @ReqContext() context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    return this.waitlistService.assign(user.organizationId, id, dto, user, context);
  }

  @Patch(':id/discard')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Descartar una entrada pendiente (motivo obligatorio)' })
  discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DiscardWaitlistEntryDto,
    @ReqContext() context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    return this.waitlistService.discard(user.organizationId, id, dto, user, context);
  }
}
