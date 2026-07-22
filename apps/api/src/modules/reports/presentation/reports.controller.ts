import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AttendanceReportDto,
  MonthlyReportEntryDto,
  ReportsSummaryDto,
  UserRole,
} from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ReportsService } from '../application/reports.service';
import { AttendanceReportQueryDto } from './dto/attendance-report-query.dto';
import { MonthlyReportQueryDto } from './dto/monthly-report-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@Roles(UserRole.ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Cantidad actual de pacientes activos, terapeutas y lista de espera' })
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<ReportsSummaryDto> {
    return this.reportsService.getSummary(user.organizationId);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Atenciones, inasistencias y cancelaciones en un rango de fechas' })
  getAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceReportQueryDto,
  ): Promise<AttendanceReportDto> {
    return this.reportsService.getAttendance(user.organizationId, query);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Rendimiento mensual: serie de los últimos N meses' })
  getMonthly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyReportQueryDto,
  ): Promise<MonthlyReportEntryDto[]> {
    return this.reportsService.getMonthly(user.organizationId, query);
  }
}
