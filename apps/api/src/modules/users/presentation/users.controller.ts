import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Paginated, UserDto, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { UsersService } from '../application/users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios de la organización' })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryUsersDto,
  ): Promise<Paginated<UserDto>> {
    return this.usersService.findMany(user.organizationId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario por id' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<UserDto> {
    return this.usersService.findOne(user.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear usuario (profesional o administrador)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @ReqContext() context: RequestContext,
  ): Promise<UserDto> {
    return this.usersService.create(user.organizationId, dto, user, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar datos, rol o estado de un usuario' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @ReqContext() context: RequestContext,
  ): Promise<UserDto> {
    return this.usersService.update(user.organizationId, id, dto, user, context);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar usuario (nunca se borra físicamente)' })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @ReqContext() context: RequestContext,
  ): Promise<void> {
    await this.usersService.deactivate(user.organizationId, id, user, context);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Asignar contraseña temporal (revoca sesiones activas)' })
  async resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @ReqContext() context: RequestContext,
  ): Promise<void> {
    await this.usersService.resetPassword(user.organizationId, id, dto, user, context);
  }
}
