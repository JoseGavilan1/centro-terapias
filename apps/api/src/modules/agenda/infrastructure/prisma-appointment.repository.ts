import { Injectable } from '@nestjs/common';
import { Appointment as PrismaAppointment, Prisma } from '@prisma/client';
import { AppointmentStatus, ConfirmedVia } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  AppointmentFilters,
  AppointmentRecord,
  AppointmentRepository,
  CreateAppointmentData,
  OverlapCheckParams,
  UpdateAppointmentData,
} from '../domain/appointment.repository';

function overlaps(aStart: number, aDuration: number, bStart: number, bDuration: number): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

@Injectable()
export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<AppointmentRecord | null> {
    const appointment = await this.prisma.appointment.findFirst({ where: { id, organizationId } });
    return appointment ? this.toRecord(appointment) : null;
  }

  async findMany(
    organizationId: string,
    filters: AppointmentFilters,
  ): Promise<{ data: AppointmentRecord[]; total: number }> {
    const where: Prisma.AppointmentWhereInput = {
      organizationId,
      ...(filters.professionalId ? { professionalId: filters.professionalId } : {}),
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            date: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async findOverlapping(
    organizationId: string,
    params: OverlapCheckParams,
  ): Promise<AppointmentRecord[]> {
    // El solapamiento horario exacto (rangos de duración variable) se filtra
    // en memoria; la consulta acota por fecha/actor/no-cancelada, que es lo
    // que un índice puede resolver bien (ver 02-modelo-datos.md §10.6).
    const candidates = await this.prisma.appointment.findMany({
      where: {
        organizationId,
        date: params.date,
        status: { not: AppointmentStatus.CANCELADA },
        OR: [{ professionalId: params.professionalId }, { patientId: params.patientId }],
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
    });

    return candidates
      .filter((candidate) =>
        overlaps(
          params.startMinute,
          params.durationMinutes,
          candidate.startMinute,
          candidate.durationMinutes,
        ),
      )
      .map((row) => this.toRecord(row));
  }

  async create(data: CreateAppointmentData): Promise<AppointmentRecord> {
    const created = await this.prisma.appointment.create({ data });
    return this.toRecord(created);
  }

  async createMany(data: CreateAppointmentData[]): Promise<number> {
    if (data.length === 0) {
      return 0;
    }
    // skipDuplicates ignora filas que violarían @@unique([therapySlotId, date]):
    // la idempotencia de CU-03 (generate-appointments) descansa en esta
    // restricción, no en un chequeo previo de existencia.
    const result = await this.prisma.appointment.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateAppointmentData,
  ): Promise<AppointmentRecord> {
    await this.prisma.appointment.updateMany({ where: { id, organizationId }, data });
    const updated = await this.prisma.appointment.findFirst({ where: { id, organizationId } });
    if (!updated) {
      throw new Prisma.PrismaClientKnownRequestError('Registro no encontrado', {
        code: 'P2025',
        clientVersion: 'app',
      });
    }
    return this.toRecord(updated);
  }

  /** Cross-tenant a propósito (Módulo 6, job de sistema) — ver la nota en el dominio. */
  async findDueForReminder(from: Date, to: Date): Promise<AppointmentRecord[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDIENTE,
        date: { gte: from, lte: to },
      },
    });
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(appointment: PrismaAppointment): AppointmentRecord {
    return {
      id: appointment.id,
      organizationId: appointment.organizationId,
      therapySlotId: appointment.therapySlotId,
      patientId: appointment.patientId,
      professionalId: appointment.professionalId,
      date: appointment.date,
      startMinute: appointment.startMinute,
      durationMinutes: appointment.durationMinutes,
      status: appointment.status as AppointmentStatus,
      confirmedVia: appointment.confirmedVia as ConfirmedVia | null,
      notes: appointment.notes,
      attendanceMarkedById: appointment.attendanceMarkedById,
      attendanceMarkedAt: appointment.attendanceMarkedAt,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    };
  }
}
