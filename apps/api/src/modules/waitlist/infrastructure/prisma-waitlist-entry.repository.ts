import { Injectable } from '@nestjs/common';
import { WaitlistEntry as PrismaWaitlistEntry, Prisma } from '@prisma/client';
import { Specialty, WaitlistStatus } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateWaitlistEntryData,
  UpdateWaitlistEntryData,
  WaitlistEntryFilters,
  WaitlistEntryRecord,
  WaitlistEntryRepository,
} from '../domain/waitlist-entry.repository';

@Injectable()
export class PrismaWaitlistEntryRepository implements WaitlistEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<WaitlistEntryRecord | null> {
    const entry = await this.prisma.waitlistEntry.findFirst({ where: { id, organizationId } });
    return entry ? this.toRecord(entry) : null;
  }

  async findMany(
    organizationId: string,
    filters: WaitlistEntryFilters,
  ): Promise<{ data: WaitlistEntryRecord[]; total: number }> {
    const where: Prisma.WaitlistEntryWhereInput = {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.requestedSpecialty ? { requestedSpecialty: filters.requestedSpecialty } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.waitlistEntry.findMany({
        where,
        // PENDIENTE primero (más antigua primero, cola de trabajo real) y luego resueltas
        // por fecha de resolución descendente (§3 CU-03).
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.waitlistEntry.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async create(data: CreateWaitlistEntryData): Promise<WaitlistEntryRecord> {
    const created = await this.prisma.waitlistEntry.create({ data });
    return this.toRecord(created);
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateWaitlistEntryData,
  ): Promise<WaitlistEntryRecord> {
    await this.prisma.waitlistEntry.updateMany({ where: { id, organizationId }, data });
    const updated = await this.prisma.waitlistEntry.findFirst({ where: { id, organizationId } });
    if (!updated) {
      throw new Prisma.PrismaClientKnownRequestError('Registro no encontrado', {
        code: 'P2025',
        clientVersion: 'app',
      });
    }
    return this.toRecord(updated);
  }

  async findOrganizationIdByIntakeToken(token: string): Promise<string | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { waitlistIntakeToken: token },
      select: { id: true },
    });
    return organization?.id ?? null;
  }

  private toRecord(entry: PrismaWaitlistEntry): WaitlistEntryRecord {
    return {
      id: entry.id,
      organizationId: entry.organizationId,
      childFirstName: entry.childFirstName,
      childLastName: entry.childLastName,
      childRut: entry.childRut,
      childBirthDate: entry.childBirthDate,
      guardianName: entry.guardianName,
      guardianPhone: entry.guardianPhone,
      guardianEmail: entry.guardianEmail,
      requestedSpecialty: entry.requestedSpecialty as Specialty | null,
      reason: entry.reason,
      sede: entry.sede,
      status: entry.status as WaitlistStatus,
      assignedPatientId: entry.assignedPatientId,
      assignedTherapySlotId: entry.assignedTherapySlotId,
      discardReason: entry.discardReason,
      resolvedAt: entry.resolvedAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }
}
