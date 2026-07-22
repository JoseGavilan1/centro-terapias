import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EvolutionDto, Paginated, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EvolutionsService } from '../application/evolutions.service';
import { CreateEvolutionDto } from './dto/create-evolution.dto';

@ApiTags('evolutions')
@ApiBearerAuth()
@Controller('patients/:patientId/evolutions')
export class EvolutionsController {
  constructor(private readonly evolutionsService: EvolutionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar el historial clínico de un paciente (ADMIN: todos; PROFESSIONAL: asignados)',
  })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<EvolutionDto>> {
    return this.evolutionsService.findMany(user.organizationId, user, patientId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una evolución puntual' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
  ): Promise<EvolutionDto> {
    return this.evolutionsService.findOne(user.organizationId, user, patientId, id);
  }

  @Post()
  @Roles(UserRole.PROFESSIONAL)
  @ApiOperation({ summary: 'Registrar una evolución clínica (append-only)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Body() dto: CreateEvolutionDto,
    @ReqContext() context: RequestContext,
  ): Promise<EvolutionDto> {
    return this.evolutionsService.create(user.organizationId, user, patientId, dto, context);
  }
}
