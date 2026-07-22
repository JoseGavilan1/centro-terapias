import { Injectable } from '@nestjs/common';
import { Incident as PrismaIncident, Prisma } from '@prisma/client';
import { IncidentStatus, IncidentType } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateIncidentData,
  IncidentFilters,
  IncidentRecord,
  IncidentRepository,
} from '../domain/incident.repository';

@Injectable()
export class PrismaIncidentRepository implements IncidentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<IncidentRecord | null> {
    const incident = await this.prisma.incident.findFirst({ where: { id, organizationId } });
    return incident ? this.toRecord(incident) : null;
  }

  async findMany(
    organizationId: string,
    filters: IncidentFilters,
  ): Promise<{ data: IncidentRecord[]; total: number }> {
    const where: Prisma.IncidentWhereInput = {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
      ...(filters.reportedById ? { reportedById: filters.reportedById } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.incident.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.incident.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async create(data: CreateIncidentData): Promise<IncidentRecord> {
    const created = await this.prisma.incident.create({ data });
    return this.toRecord(created);
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: IncidentStatus,
  ): Promise<IncidentRecord> {
    await this.prisma.incident.updateMany({ where: { id, organizationId }, data: { status } });
    const updated = await this.prisma.incident.findFirst({ where: { id, organizationId } });
    if (!updated) {
      throw new Prisma.PrismaClientKnownRequestError('Registro no encontrado', {
        code: 'P2025',
        clientVersion: 'app',
      });
    }
    return this.toRecord(updated);
  }

  private toRecord(incident: PrismaIncident): IncidentRecord {
    return {
      id: incident.id,
      organizationId: incident.organizationId,
      patientId: incident.patientId,
      reportedById: incident.reportedById,
      type: incident.type as IncidentType,
      description: incident.description,
      occurredAt: incident.occurredAt,
      status: incident.status as IncidentStatus,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }
}
