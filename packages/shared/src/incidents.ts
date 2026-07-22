import type { PageQuery } from './pagination';

export enum IncidentType {
  VIOLENCIA = 'VIOLENCIA',
  ABUSO = 'ABUSO',
  ACCIDENTE = 'ACCIDENTE',
  SITUACION_GRAVE = 'SITUACION_GRAVE',
}

export enum IncidentStatus {
  ABIERTA = 'ABIERTA',
  EN_REVISION = 'EN_REVISION',
  CERRADA = 'CERRADA',
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  [IncidentType.VIOLENCIA]: 'Violencia',
  [IncidentType.ABUSO]: 'Abuso',
  [IncidentType.ACCIDENTE]: 'Accidente',
  [IncidentType.SITUACION_GRAVE]: 'Situación grave',
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  [IncidentStatus.ABIERTA]: 'Abierta',
  [IncidentStatus.EN_REVISION]: 'En revisión',
  [IncidentStatus.CERRADA]: 'Cerrada',
};

export interface IncidentDto {
  id: string;
  patientId: string | null;
  reportedById: string;
  type: IncidentType;
  description: string;
  /** Fecha y hora ISO 8601 en que ocurrió el incidente. */
  occurredAt: string;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIncidentRequest {
  /** Opcional: un incidente puede no involucrar a un paciente específico (p. ej. un accidente en el centro). */
  patientId?: string;
  type: IncidentType;
  description: string;
  /** Fecha y hora ISO 8601; no puede ser futura. */
  occurredAt: string;
}

/**
 * Solo ADMIN. No permite modificar el reporte original (tipo/descripción/paciente/fecha) —
 * únicamente el estado de seguimiento. `CERRADA` es terminal (no se reabre).
 */
export interface UpdateIncidentStatusRequest {
  status: IncidentStatus;
}

export interface IncidentsQuery extends PageQuery {
  status?: IncidentStatus;
  type?: IncidentType;
  patientId?: string;
}
