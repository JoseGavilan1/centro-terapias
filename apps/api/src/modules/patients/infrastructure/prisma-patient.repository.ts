import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreatePatientData,
  PatientFilters,
  PatientRecord,
  PatientRepository,
  UpdatePatientData,
} from '../domain/patient.repository';

@Injectable()
export class PrismaPatientRepository implements PatientRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string): Promise<PatientRecord | null> {
    return this.prisma.patient.findFirst({ where: { id, organizationId } });
  }

  findByRut(
    organizationId: string,
    rut: string,
    excludeId?: string,
  ): Promise<PatientRecord | null> {
    return this.prisma.patient.findFirst({
      where: {
        organizationId,
        rut,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(
    organizationId: string,
    filters: PatientFilters,
  ): Promise<{ data: PatientRecord[]; total: number }> {
    const where: Prisma.PatientWhereInput = {
      organizationId,
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.patientIds ? { id: { in: filters.patientIds } } : {}),
      ...(filters.search
        ? {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { rut: { contains: filters.search.replace(/[.\s]/g, ''), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { data: rows, total };
  }

  create(data: CreatePatientData): Promise<PatientRecord> {
    return this.prisma.patient.create({ data });
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdatePatientData,
  ): Promise<PatientRecord> {
    // updateMany + relectura: garantiza el filtro por tenant en la escritura
    // (mismo patrón que PrismaUserRepository.update).
    await this.prisma.patient.updateMany({ where: { id, organizationId }, data });
    const updated = await this.prisma.patient.findFirst({ where: { id, organizationId } });
    if (!updated) {
      throw new Prisma.PrismaClientKnownRequestError('Registro no encontrado', {
        code: 'P2025',
        clientVersion: 'app',
      });
    }
    return updated;
  }
}
