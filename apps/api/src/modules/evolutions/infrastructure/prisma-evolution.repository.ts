import { Injectable } from '@nestjs/common';
import { Evolution as PrismaEvolution } from '@prisma/client';
import { ClinicalConfidentiality } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateEvolutionData,
  EvolutionFilters,
  EvolutionRecord,
  EvolutionRepository,
} from '../domain/evolution.repository';

@Injectable()
export class PrismaEvolutionRepository implements EvolutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<EvolutionRecord | null> {
    const evolution = await this.prisma.evolution.findFirst({ where: { id, organizationId } });
    return evolution ? this.toRecord(evolution) : null;
  }

  async findMany(
    organizationId: string,
    filters: EvolutionFilters,
  ): Promise<{ data: EvolutionRecord[]; total: number }> {
    const where = { organizationId, patientId: filters.patientId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.evolution.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.evolution.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async findByAppointmentId(
    organizationId: string,
    appointmentId: string,
  ): Promise<EvolutionRecord | null> {
    const evolution = await this.prisma.evolution.findFirst({
      where: { appointmentId, organizationId },
    });
    return evolution ? this.toRecord(evolution) : null;
  }

  async create(data: CreateEvolutionData): Promise<EvolutionRecord> {
    const created = await this.prisma.evolution.create({ data });
    return this.toRecord(created);
  }

  private toRecord(evolution: PrismaEvolution): EvolutionRecord {
    return {
      id: evolution.id,
      organizationId: evolution.organizationId,
      patientId: evolution.patientId,
      authorId: evolution.authorId,
      appointmentId: evolution.appointmentId,
      amendsId: evolution.amendsId,
      date: evolution.date,
      observation: evolution.observation,
      workPlan: evolution.workPlan,
      confidentiality: evolution.confidentiality as ClinicalConfidentiality,
      createdAt: evolution.createdAt,
    };
  }
}
