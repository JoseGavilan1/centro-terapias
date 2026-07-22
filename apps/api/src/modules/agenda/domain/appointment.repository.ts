import { AppointmentStatus, ConfirmedVia } from '@centro/shared';

export interface AppointmentRecord {
  id: string;
  organizationId: string;
  /** NULL = sobrecupo (creada sin plantilla). */
  therapySlotId: string | null;
  patientId: string;
  professionalId: string;
  date: Date;
  startMinute: number;
  durationMinutes: number;
  status: AppointmentStatus;
  confirmedVia: ConfirmedVia | null;
  notes: string | null;
  attendanceMarkedById: string | null;
  attendanceMarkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAppointmentData {
  organizationId: string;
  therapySlotId: string | null;
  patientId: string;
  professionalId: string;
  date: Date;
  startMinute: number;
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string | null;
}

export interface UpdateAppointmentData {
  status?: AppointmentStatus;
  confirmedVia?: ConfirmedVia | null;
  notes?: string | null;
  attendanceMarkedById?: string | null;
  attendanceMarkedAt?: Date | null;
}

export interface AppointmentFilters {
  dateFrom?: Date;
  dateTo?: Date;
  professionalId?: string;
  patientId?: string;
  status?: AppointmentStatus;
  page: number;
  pageSize: number;
}

export interface OverlapCheckParams {
  professionalId: string;
  patientId: string;
  date: Date;
  startMinute: number;
  durationMinutes: number;
  excludeId?: string;
}

/**
 * Todo método recibe `organizationId` explícito (ADR-03), igual que PatientRepository —
 * **excepto** `findDueForReminder`, la única excepción documentada del sistema: un job de
 * fondo (Módulo 6), no una request de un tenant (ver modulo-06-whatsapp.md §1.2).
 */
export interface AppointmentRepository {
  findById(organizationId: string, id: string): Promise<AppointmentRecord | null>;
  findMany(
    organizationId: string,
    filters: AppointmentFilters,
  ): Promise<{ data: AppointmentRecord[]; total: number }>;
  /** Citas no canceladas del mismo profesional o paciente que se solapan en fecha/horario. */
  findOverlapping(organizationId: string, params: OverlapCheckParams): Promise<AppointmentRecord[]>;
  create(data: CreateAppointmentData): Promise<AppointmentRecord>;
  /** Inserta en lote, ignorando filas que violen `@@unique([therapySlotId, date])` (idempotencia de CU-03). */
  createMany(data: CreateAppointmentData[]): Promise<number>;
  update(
    organizationId: string,
    id: string,
    data: UpdateAppointmentData,
  ): Promise<AppointmentRecord>;
  /**
   * Citas `PENDIENTE` en `[from, to]` de **todas** las organizaciones — insumo del recordatorio
   * diario de WhatsApp (CU-02). Cada registro trae su propio `organizationId` para resolver a
   * qué organización pertenece.
   */
  findDueForReminder(from: Date, to: Date): Promise<AppointmentRecord[]>;
}

export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');
