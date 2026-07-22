import { Inject, Injectable } from '@nestjs/common';
import { AuditLogDto, AuditLogsQuery, DEFAULT_PAGE_SIZE, Paginated, paginate } from '@centro/shared';
import {
  AUDIT_LOG_REPOSITORY,
  AuditEntry,
  AuditLogRecord,
  AuditLogRepository,
} from '../domain/audit-log.repository';

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogRepository: AuditLogRepository,
  ) {}

  /**
   * Registra un evento de auditoría dentro de la misma operación.
   * Si la escritura falla, la operación completa falla: para datos clínicos
   * es preferible rechazar la mutación a perder la traza (ADR-10).
   */
  log(entry: AuditEntry): Promise<void> {
    return this.auditLogRepository.create(entry);
  }

  async find(organizationId: string, query: AuditLogsQuery): Promise<Paginated<AuditLogDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.auditLogRepository.findMany(organizationId, {
      entity: query.entity,
      userId: query.userId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page,
      pageSize,
    });
    return paginate(data.map((record) => this.toDto(record)), total, { page, pageSize });
  }

  private toDto(record: AuditLogRecord): AuditLogDto {
    return {
      id: record.id,
      userId: record.userId,
      userEmail: record.userEmail,
      action: record.action,
      entity: record.entity,
      entityId: record.entityId,
      oldValue: record.oldValue ?? null,
      newValue: record.newValue ?? null,
      ip: record.ip,
      userAgent: record.userAgent,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
