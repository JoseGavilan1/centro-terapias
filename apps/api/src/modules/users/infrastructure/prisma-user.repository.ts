import { Injectable } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '@prisma/client';
import { Specialty, UserRole } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateUserData,
  UpdateUserData,
  UserFilters,
  UserRecord,
  UserRepository,
  UserWithOrganization,
} from '../domain/user.repository';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserWithOrganization | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { organization: { select: { name: true } } },
    });
    return user ? { ...this.toRecord(user), organizationName: user.organization.name } : null;
  }

  async findByIdAny(id: string): Promise<UserWithOrganization | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { organization: { select: { name: true } } },
    });
    return user ? { ...this.toRecord(user), organizationName: user.organization.name } : null;
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { email: email.toLowerCase() } });
    return count > 0;
  }

  async findById(organizationId: string, id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    return user ? this.toRecord(user) : null;
  }

  async findByIdWithOrganization(
    organizationId: string,
    id: string,
  ): Promise<UserWithOrganization | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      include: { organization: { select: { name: true } } },
    });
    return user ? { ...this.toRecord(user), organizationName: user.organization.name } : null;
  }

  async findMany(
    organizationId: string,
    filters: UserFilters,
  ): Promise<{ data: UserRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.specialty ? { specialty: filters.specialty } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search
        ? {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        specialty: data.specialty,
        phone: data.phone,
        mustChangePassword: data.mustChangePassword,
      },
    });
    return this.toRecord(user);
  }

  async update(organizationId: string, id: string, data: UpdateUserData): Promise<UserRecord> {
    // updateMany + relectura: garantiza el filtro por tenant en la escritura.
    await this.prisma.user.updateMany({
      where: { id, organizationId },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.specialty !== undefined ? { specialty: data.specialty } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
        ...(data.mustChangePassword !== undefined
          ? { mustChangePassword: data.mustChangePassword }
          : {}),
      },
    });
    const updated = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!updated) {
      throw new Prisma.PrismaClientKnownRequestError('Registro no encontrado', {
        code: 'P2025',
        clientVersion: 'app',
      });
    }
    return this.toRecord(updated);
  }

  private toRecord(user: PrismaUser): UserRecord {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      passwordHash: user.passwordHash,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as UserRole,
      specialty: user.specialty as Specialty | null,
      phone: user.phone,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
