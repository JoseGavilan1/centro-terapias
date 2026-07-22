import { ClinicalConfidentiality } from '@centro/shared';

export interface EvolutionRecord {
  id: string;
  organizationId: string;
  patientId: string;
  authorId: string;
  appointmentId: string | null;
  amendsId: string | null;
  date: Date;
  observation: string;
  workPlan: string;
  confidentiality: ClinicalConfidentiality;
  createdAt: Date;
}

export interface CreateEvolutionData {
  organizationId: string;
  patientId: string;
  authorId: string;
  appointmentId: string | null;
  amendsId: string | null;
  date: Date;
  observation: string;
  workPlan: string;
  confidentiality: ClinicalConfidentiality;
}

export interface EvolutionFilters {
  patientId: string;
  page: number;
  pageSize: number;
}

/**
 * Repositorio append-only (mismo criterio que AuditLogRepository): no expone
 * update ni delete. Todo método recibe `organizationId` explícito (ADR-03).
 */
export interface EvolutionRepository {
  findById(organizationId: string, id: string): Promise<EvolutionRecord | null>;
  findMany(
    organizationId: string,
    filters: EvolutionFilters,
  ): Promise<{ data: EvolutionRecord[]; total: number }>;
  /** Para validar la unicidad de CU-01 (una evolución por cita) antes de insertar. */
  findByAppointmentId(
    organizationId: string,
    appointmentId: string,
  ): Promise<EvolutionRecord | null>;
  create(data: CreateEvolutionData): Promise<EvolutionRecord>;
}

export const EVOLUTION_REPOSITORY = Symbol('EVOLUTION_REPOSITORY');
