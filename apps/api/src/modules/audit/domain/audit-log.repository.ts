import { AuditAction } from '@centro/shared';

/** Entrada a registrar. `oldValue`/`newValue` NUNCA deben incluir secretos (password_hash). */
export interface AuditEntry {
  /** Null solo para eventos de seguridad sin tenant resoluble (p. ej. login con email inexistente). */
  organizationId: string | null;
  userId: string | null;
  userEmail: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip: string | null;
  userAgent: string | null;
}

export interface AuditLogRecord extends AuditEntry {
  id: string;
  createdAt: Date;
}

export interface AuditLogFilters {
  entity?: string;
  userId?: string;
  action?: AuditAction;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

/**
 * Repositorio append-only: deliberadamente NO expone update ni delete
 * (la auditoría es inmutable por requisito).
 */
export interface AuditLogRepository {
  create(entry: AuditEntry): Promise<void>;
  findMany(
    organizationId: string,
    filters: AuditLogFilters,
  ): Promise<{ data: AuditLogRecord[]; total: number }>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
