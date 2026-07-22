import type { PageQuery } from './pagination';

export enum Weekday {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export enum AppointmentStatus {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADA = 'CONFIRMADA',
  CANCELADA = 'CANCELADA',
  NO_ASISTIO = 'NO_ASISTIO',
  SOBRECUPO = 'SOBRECUPO',
  ATENDIDA = 'ATENDIDA',
}

export enum ConfirmedVia {
  WHATSAPP = 'WHATSAPP',
  MANUAL = 'MANUAL',
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  [Weekday.MONDAY]: 'Lunes',
  [Weekday.TUESDAY]: 'Martes',
  [Weekday.WEDNESDAY]: 'Miércoles',
  [Weekday.THURSDAY]: 'Jueves',
  [Weekday.FRIDAY]: 'Viernes',
  [Weekday.SATURDAY]: 'Sábado',
  [Weekday.SUNDAY]: 'Domingo',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  [AppointmentStatus.PENDIENTE]: 'Pendiente',
  [AppointmentStatus.CONFIRMADA]: 'Confirmada',
  [AppointmentStatus.CANCELADA]: 'Cancelada',
  [AppointmentStatus.NO_ASISTIO]: 'No asistió',
  [AppointmentStatus.SOBRECUPO]: 'Sobrecupo',
  [AppointmentStatus.ATENDIDA]: 'Atendida',
};

/** Estados desde los que ya no se permite ninguna transición (ver modulo-03-agenda.md §1.1). */
export const TERMINAL_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.CANCELADA,
  AppointmentStatus.ATENDIDA,
  AppointmentStatus.NO_ASISTIO,
]);

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:30" -> 570. No valida el formato; usar junto a `isValidTimeString`. */
export function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 570 -> "09:30". */
export function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** true si `value` tiene formato "HH:MM" en 24 horas. */
export function isValidTimeString(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export interface TherapySlotDto {
  id: string;
  patientId: string;
  professionalId: string;
  weekday: Weekday;
  startTime: string;
  durationMinutes: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTherapySlotRequest {
  patientId: string;
  professionalId: string;
  weekday: Weekday;
  startTime: string;
  durationMinutes: number;
  /** Fecha ISO 8601 (solo fecha), p. ej. "2026-03-01". */
  validFrom: string;
  validTo?: string;
}

export interface UpdateTherapySlotRequest {
  patientId?: string;
  professionalId?: string;
  weekday?: Weekday;
  startTime?: string;
  durationMinutes?: number;
  validFrom?: string;
  validTo?: string | null;
  isActive?: boolean;
}

export interface TherapySlotsQuery extends PageQuery {
  /** Ignorado si el actor es PROFESSIONAL (se fuerza a su propio id). */
  professionalId?: string;
  patientId?: string;
}

export interface AppointmentDto {
  id: string;
  therapySlotId: string | null;
  patientId: string;
  professionalId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
  confirmedVia: ConfirmedVia | null;
  notes: string | null;
  attendanceMarkedById: string | null;
  attendanceMarkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentRequest {
  patientId: string;
  professionalId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  notes?: string;
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus.CONFIRMADA | AppointmentStatus.CANCELADA;
  notes?: string;
}

export interface MarkAttendanceRequest {
  status: AppointmentStatus.ATENDIDA | AppointmentStatus.NO_ASISTIO | AppointmentStatus.CANCELADA;
  notes?: string;
}

export interface AppointmentsQuery extends PageQuery {
  dateFrom?: string;
  dateTo?: string;
  /** Ignorado si el actor es PROFESSIONAL (se fuerza a su propio id). */
  professionalId?: string;
  patientId?: string;
  status?: AppointmentStatus;
}

export interface GenerateAppointmentsRequest {
  from: string;
  to: string;
}

export interface GenerateAppointmentsResult {
  created: number;
  skipped: number;
}
