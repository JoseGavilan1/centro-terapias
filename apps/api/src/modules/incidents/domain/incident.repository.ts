import { IncidentStatus, IncidentType } from '@centro/shared';

export interface IncidentRecord {
  id: string;
  organizationId: string;
  patientId: string | null;
  reportedById: string;
  type: IncidentType;
  description: string;
  occurredAt: Date;
  status: IncidentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIncidentData {
  organizationId: string;
  patientId: string | null;
  reportedById: string;
  type: IncidentType;
  description: string;
  occurredAt: Date;
}

export interface IncidentFilters {
  status?: IncidentStatus;
  type?: IncidentType;
  patientId?: string;
  /** Solo definido para PROFESSIONAL (§1.2 modulo-08-incidencias.md): ve únicamente lo que reportó. */
  reportedById?: string;
  page: number;
  pageSize: number;
}

export interface IncidentRepository {
  findById(organizationId: string, id: string): Promise<IncidentRecord | null>;
  findMany(
    organizationId: string,
    filters: IncidentFilters,
  ): Promise<{ data: IncidentRecord[]; total: number }>;
  create(data: CreateIncidentData): Promise<IncidentRecord>;
  /** Solo actualiza `status` (§1.3): el reporte original nunca se modifica. */
  updateStatus(organizationId: string, id: string, status: IncidentStatus): Promise<IncidentRecord>;
}

export const INCIDENT_REPOSITORY = Symbol('INCIDENT_REPOSITORY');
