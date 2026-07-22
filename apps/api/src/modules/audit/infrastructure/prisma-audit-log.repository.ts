import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  AuditEntry,
  AuditLogFilters,
  AuditLogRecord,
  AuditLogRepository,
} from '../domain/audit-log.repository';

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        userEmail: entry.userEmail,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        oldValue: entry.oldValue === undefined ? Prisma.DbNull : (entry.oldValue as Prisma.InputJsonValue),
        newValue: entry.newValue === undefined ? Prisma.DbNull : (entry.newValue as Prisma.InputJsonValue),
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  }

  async findMany(
    organizationId: string,
    filters: AuditLogFilters,
  ): Promise<{ data: AuditLogRecord[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        userId: row.userId,
        userEmail: row.userEmail,
        action: row.action as AuditAction,
        entity: row.entity,
        entityId: row.entityId,
        oldValue: row.oldValue,
        newValue: row.newValue,
        ip: row.ip,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
      })),
      total,
    };
  }
}
