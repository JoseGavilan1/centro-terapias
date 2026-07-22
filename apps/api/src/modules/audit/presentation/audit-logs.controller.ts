import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogDto, Paginated, UserRole } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../application/audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Consultar el registro de auditoría de la organización' })
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryAuditLogsDto,
  ): Promise<Paginated<AuditLogDto>> {
    return this.auditService.find(user.organizationId, query);
  }
}
