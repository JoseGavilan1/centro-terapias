import { Weekday } from '@centro/shared';

export interface TherapySlotRecord {
  id: string;
  organizationId: string;
  patientId: string;
  professionalId: string;
  weekday: Weekday;
  startMinute: number;
  durationMinutes: number;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTherapySlotData {
  organizationId: string;
  patientId: string;
  professionalId: string;
  weekday: Weekday;
  startMinute: number;
  durationMinutes: number;
  validFrom: Date;
  validTo: Date | null;
}

export interface UpdateTherapySlotData {
  patientId?: string;
  professionalId?: string;
  weekday?: Weekday;
  startMinute?: number;
  durationMinutes?: number;
  validFrom?: Date;
  validTo?: Date | null;
  isActive?: boolean;
}

export interface TherapySlotFilters {
  professionalId?: string;
  patientId?: string;
  page: number;
  pageSize: number;
}

/**
 * Todo método recibe `organizationId` explícito (ADR-03), igual que
 * PatientRepository. El solapamiento (§1 de modulo-03-agenda.md) se valida
 * en la aplicación con los datos devueltos por los métodos `findActiveBy*`,
 * no como restricción de base de datos.
 */
export interface TherapySlotRepository {
  findById(organizationId: string, id: string): Promise<TherapySlotRecord | null>;
  findMany(
    organizationId: string,
    filters: TherapySlotFilters,
  ): Promise<{ data: TherapySlotRecord[]; total: number }>;
  /** Slots activos del mismo profesional en el mismo día de la semana. */
  findActiveByProfessionalAndWeekday(
    organizationId: string,
    professionalId: string,
    weekday: Weekday,
    excludeId?: string,
  ): Promise<TherapySlotRecord[]>;
  /** Slots activos del mismo paciente en el mismo día de la semana. */
  findActiveByPatientAndWeekday(
    organizationId: string,
    patientId: string,
    weekday: Weekday,
    excludeId?: string,
  ): Promise<TherapySlotRecord[]>;
  /** Todos los slots activos de la organización (insumo para generar instancias). */
  findAllActive(organizationId: string): Promise<TherapySlotRecord[]>;
  /** Ids distintos de pacientes con al menos un slot activo del profesional dado. */
  findAssignedPatientIds(organizationId: string, professionalId: string): Promise<string[]>;
  create(data: CreateTherapySlotData): Promise<TherapySlotRecord>;
  update(
    organizationId: string,
    id: string,
    data: UpdateTherapySlotData,
  ): Promise<TherapySlotRecord>;
}

export const THERAPY_SLOT_REPOSITORY = Symbol('THERAPY_SLOT_REPOSITORY');
