import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationDto, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { OrganizationsService } from '../application/organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Obtener los datos de la organización actual' })
  getCurrent(@CurrentUser() user: AuthenticatedUser): Promise<OrganizationDto> {
    return this.organizationsService.getCurrent(user.organizationId);
  }

  @Patch('current')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar los datos de la organización actual' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrganizationDto,
    @ReqContext() context: RequestContext,
  ): Promise<OrganizationDto> {
    return this.organizationsService.update(user.organizationId, dto, user, context);
  }
}
