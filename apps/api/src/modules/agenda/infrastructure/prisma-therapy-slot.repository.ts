import { Injectable } from '@nestjs/common';
import { Prisma, TherapySlot as PrismaTherapySlot } from '@prisma/client';
import { Weekday } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateTherapySlotData,
  TherapySlotFilters,
  TherapySlotRecord,
  TherapySlotRepository,
  UpdateTherapySlotData,
} from '../domain/therapy-slot.repository';

@Injectable()
export class PrismaTherapySlotRepository implements TherapySlotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<TherapySlotRecord | null> {
    const slot = await this.prisma.therapySlot.findFirst({ where: { id, organizationId } });
    return slot ? this.toRecord(slot) : null;
  }

  async findMany(
    organizationId: string,
    filters: TherapySlotFilters,
  ): Promise<{ data: TherapySlotRecord[]; total: number }> {
    const where: Prisma.TherapySlotWhereInput = {
      organizationId,
      ...(filters.professionalId ? { professionalId: filters.professionalId } : {}),
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.therapySlot.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { weekday: 'asc' }, { startMinute: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.therapySlot.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async findActiveByProfessionalAndWeekday(
    organizationId: string,
    professionalId: string,
    weekday: Weekday,
    excludeId?: string,
  ): Promise<TherapySlotRecord[]> {
    const rows = await this.prisma.therapySlot.findMany({
      where: {
        organizationId,
        professionalId,
        weekday,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findActiveByPatientAndWeekday(
    organizationId: string,
    patientId: string,
    weekday: Weekday,
    excludeId?: string,
  ): Promise<TherapySlotRecord[]> {
    const rows = await this.prisma.therapySlot.findMany({
      where: {
        organizationId,
        patientId,
        weekday,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findAllActive(organizationId: string): Promise<TherapySlotRecord[]> {
    const rows = await this.prisma.therapySlot.findMany({
      where: { organizationId, isActive: true },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findAssignedPatientIds(organizationId: string, professionalId: string): Promise<string[]> {
    const rows = await this.prisma.therapySlot.findMany({
      where: { organizationId, professionalId, isActive: true },
      select: { patientId: true },
      distinct: ['patientId'],
    });
    return rows.map((row) => row.patientId);
  }

  async create(data: CreateTherapySlotData): Promise<TherapySlotRecord> {
    const created = await this.prisma.therapySlot.create({ data });
    return this.toRecord(created);
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateTherapySlotData,
  ): Promise<TherapySlotRecord> {
    // updateMany + relectura: garantiza el filtro por tenant en la escritura
    // (mismo patrón que PrismaPatientRepository.update).
    await this.prisma.therapySlot.updateMany({ where: { id, organizationId }, data });
    const updated = await this.prisma.therapySlot.findFirst({ where: { id, organizationId } });
    if (!updated) {
      throw new Prisma.PrismaClientKnownRequestError('Registro no encontrado', {
        code: 'P2025',
        clientVersion: 'app',
      });
    }
    return this.toRecord(updated);
  }

  private toRecord(slot: PrismaTherapySlot): TherapySlotRecord {
    return {
      id: slot.id,
      organizationId: slot.organizationId,
      patientId: slot.patientId,
      professionalId: slot.professionalId,
      weekday: slot.weekday as Weekday,
      startMinute: slot.startMinute,
      durationMinutes: slot.durationMinutes,
      validFrom: slot.validFrom,
      validTo: slot.validTo,
      isActive: slot.isActive,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
    };
  }
}
