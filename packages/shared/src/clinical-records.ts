import type { PageQuery } from './pagination';

export enum ClinicalConfidentiality {
  STANDARD = 'STANDARD',
  PSYCHOLOGICAL = 'PSYCHOLOGICAL',
}

/**
 * `observation`/`workPlan`/`amendsId` viajan en `null` y `redacted=true` cuando el actor no
 * tiene permiso para leer contenido `PSYCHOLOGICAL` (ADR-04, ver modulo-04-fichas-clinicas.md
 * §1). El propio autor y cualquier PROFESSIONAL con `specialty=PSICOLOGIA` reciben `redacted=false`.
 */
export interface EvolutionDto {
  id: string;
  patientId: string;
  authorId: string;
  appointmentId: string | null;
  amendsId: string | null;
  date: string;
  confidentiality: ClinicalConfidentiality;
  redacted: boolean;
  observation: string | null;
  workPlan: string | null;
  createdAt: string;
}

export interface CreateEvolutionRequest {
  /** Fecha ISO 8601 (solo fecha), no puede ser futura. */
  date: string;
  observation: string;
  workPlan: string;
  /** Cita ATENDIDA propia sin evolución asociada (Módulo 3). */
  appointmentId?: string;
  /** Evolución que esta corrige, del mismo paciente. */
  amendsId?: string;
}

export type EvolutionsQuery = PageQuery;
