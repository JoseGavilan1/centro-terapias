import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  AttendanceReportDto,
  AttendanceReportQuery,
  DEFAULT_MONTHLY_REPORT_MONTHS,
  MAX_MONTHLY_REPORT_MONTHS,
  MonthlyReportEntryDto,
  MonthlyReportQuery,
  ReportsSummaryDto,
  UserRole,
  WaitlistStatus,
} from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { buildMonthBoundaries, resolveAttendanceRange } from './report-range.util';

type AppointmentStatusCounts = Record<AppointmentStatus, number>;

const EMPTY_STATUS_COUNTS: AppointmentStatusCounts = {
  [AppointmentStatus.PENDIENTE]: 0,
  [AppointmentStatus.CONFIRMADA]: 0,
  [AppointmentStatus.CANCELADA]: 0,
  [AppointmentStatus.NO_ASISTIO]: 0,
  [AppointmentStatus.SOBRECUPO]: 0,
  [AppointmentStatus.ATENDIDA]: 0,
};

/**
 * Puramente agregación de lectura sobre entidades de otros módulos (Patient, Appointment, User,
 * WaitlistEntry): no tiene una entidad propia que justifique domain/infrastructure — inyecta
 * `PrismaService` directamente en la capa de aplicación, mismo criterio ya establecido para
 * lecturas cruzadas en `WhatsAppConversationService`/`IncidentsService` (ver
 * modulo-09-reportes.md §1.1).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string): Promise<ReportsSummaryDto> {
    const [activePatients, activeProfessionals, pendingWaitlistEntries] = await Promise.all([
      this.prisma.patient.count({ where: { organizationId, isActive: true } }),
      this.prisma.user.count({
        where: { organizationId, role: UserRole.PROFESSIONAL, isActive: true },
      }),
      this.prisma.waitlistEntry.count({
        where: { organizationId, status: WaitlistStatus.PENDIENTE },
      }),
    ]);
    return { activePatients, activeProfessionals, pendingWaitlistEntries };
  }

  async getAttendance(
    organizationId: string,
    query: AttendanceReportQuery,
  ): Promise<AttendanceReportDto> {
    const { from, toExclusive } = resolveAttendanceRange(query.from, query.to);
    const counts = await this.countAppointmentsByStatus(organizationId, from, toExclusive);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    return {
      from: from.toISOString().slice(0, 10),
      // Inclusive en la respuesta: un día antes del límite exclusivo interno.
      to: new Date(toExclusive.getTime() - 86400000).toISOString().slice(0, 10),
      total,
      pending: counts[AppointmentStatus.PENDIENTE],
      confirmed: counts[AppointmentStatus.CONFIRMADA],
      cancelled: counts[AppointmentStatus.CANCELADA],
      noShow: counts[AppointmentStatus.NO_ASISTIO],
      overbooked: counts[AppointmentStatus.SOBRECUPO],
      attended: counts[AppointmentStatus.ATENDIDA],
    };
  }

  async getMonthly(
    organizationId: string,
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportEntryDto[]> {
    const months = Math.min(
      query.months ?? DEFAULT_MONTHLY_REPORT_MONTHS,
      MAX_MONTHLY_REPORT_MONTHS,
    );
    const boundaries = buildMonthBoundaries(months);

    return Promise.all(
      boundaries.map(async ({ month, start, endExclusive }) => {
        const [counts, newPatients, newWaitlistEntries] = await Promise.all([
          this.countAppointmentsByStatus(organizationId, start, endExclusive),
          this.prisma.patient.count({
            where: { organizationId, createdAt: { gte: start, lt: endExclusive } },
          }),
          this.prisma.waitlistEntry.count({
            where: { organizationId, createdAt: { gte: start, lt: endExclusive } },
          }),
        ]);
        const totalAppointments = Object.values(counts).reduce((sum, value) => sum + value, 0);

        return {
          month,
          totalAppointments,
          attended: counts[AppointmentStatus.ATENDIDA],
          noShow: counts[AppointmentStatus.NO_ASISTIO],
          cancelled: counts[AppointmentStatus.CANCELADA],
          newPatients,
          newWaitlistEntries,
        };
      }),
    );
  }

  private async countAppointmentsByStatus(
    organizationId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<AppointmentStatusCounts> {
    const groups = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: { organizationId, date: { gte: from, lt: toExclusive } },
      _count: true,
    });

    const counts = { ...EMPTY_STATUS_COUNTS };
    for (const group of groups) {
      counts[group.status as AppointmentStatus] = group._count;
    }
    return counts;
  }
}
