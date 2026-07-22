import type { PageQuery } from './pagination';
import type { Specialty } from './enums';
import type { Weekday } from './agenda';

export enum WaitlistStatus {
  PENDIENTE = 'PENDIENTE',
  ASIGNADA = 'ASIGNADA',
  DESCARTADA = 'DESCARTADA',
}

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  [WaitlistStatus.PENDIENTE]: 'Pendiente',
  [WaitlistStatus.ASIGNADA]: 'Asignada',
  [WaitlistStatus.DESCARTADA]: 'Descartada',
};

export interface WaitlistEntryDto {
  id: string;
  childFirstName: string;
  childLastName: string;
  childRut: string | null;
  childBirthDate: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  requestedSpecialty: Specialty | null;
  reason: string | null;
  sede: string | null;
  status: WaitlistStatus;
  assignedPatientId: string | null;
  assignedTherapySlotId: string | null;
  discardReason: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body compartido por el webhook de intake (Google Forms) y el ingreso manual (ADMIN). */
export interface IntakeWaitlistRequest {
  childFirstName: string;
  childLastName: string;
  /** Con o sin puntos; se normaliza igual que `CreatePatientRequest.rut`. */
  childRut?: string;
  /** Fecha ISO 8601 (solo fecha), p. ej. "2020-05-10". No puede ser futura. */
  childBirthDate?: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  requestedSpecialty?: Specialty;
  reason?: string;
}

export type CreateWaitlistEntryRequest = IntakeWaitlistRequest;

export interface UpdateWaitlistEntryRequest {
  childFirstName?: string;
  childLastName?: string;
  childRut?: string;
  childBirthDate?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  requestedSpecialty?: Specialty;
  reason?: string;
  sede?: string;
}

export interface AssignWaitlistEntryRequest {
  professionalId: string;
  weekday: Weekday;
  startTime: string;
  durationMinutes: number;
  /** Fecha ISO 8601 (solo fecha), p. ej. "2026-03-01". */
  validFrom: string;
  sede?: string;
  /** Obligatorio si la entrada no trae `childRut` (validado en el servicio). */
  rut?: string;
  /** Obligatorio si la entrada no trae `childBirthDate` (validado en el servicio). */
  birthDate?: string;
}

export interface DiscardWaitlistEntryRequest {
  reason: string;
}

export interface WaitlistQuery extends PageQuery {
  status?: WaitlistStatus;
  requestedSpecialty?: Specialty;
}
