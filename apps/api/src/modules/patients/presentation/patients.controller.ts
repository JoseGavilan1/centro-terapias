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
import { Paginated, PatientDto, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { PatientsService } from '../application/patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar pacientes (ADMIN: todos; PROFESSIONAL: solo los asignados, §1.2 Módulo 3)',
  })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryPatientsDto,
  ): Promise<Paginated<PatientDto>> {
    return this.patientsService.findMany(user.organizationId, user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un paciente por id (PROFESSIONAL: solo si tiene un slot activo asignado)',
  })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PatientDto> {
    return this.patientsService.findOne(user.organizationId, user, id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar un paciente nuevo' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePatientDto,
    @ReqContext() context: RequestContext,
  ): Promise<PatientDto> {
    return this.patientsService.create(user.organizationId, dto, user, context);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar los datos de un paciente' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @ReqContext() context: RequestContext,
  ): Promise<PatientDto> {
    return this.patientsService.update(user.organizationId, id, dto, user, context);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar paciente (nunca se borra físicamente)' })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @ReqContext() context: RequestContext,
  ): Promise<void> {
    await this.patientsService.deactivate(user.organizationId, id, user, context);
  }
}
