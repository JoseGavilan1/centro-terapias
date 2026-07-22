export const DEFAULT_MONTHLY_REPORT_MONTHS = 6;
export const MAX_MONTHLY_REPORT_MONTHS = 24;

/** Estado actual (no acotado a un período): pacientes, terapeutas y lista de espera. */
export interface ReportsSummaryDto {
  activePatients: number;
  activeProfessionals: number;
  pendingWaitlistEntries: number;
}

export interface AttendanceReportQuery {
  /** Fecha ISO 8601 (YYYY-MM-DD); default: primer día del mes actual. */
  from?: string;
  /** Fecha ISO 8601 (YYYY-MM-DD), inclusive; default: hoy. */
  to?: string;
}

/** Atenciones, inasistencias y cancelaciones del rango, según `Appointment.status`. */
export interface AttendanceReportDto {
  from: string;
  to: string;
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  noShow: number;
  overbooked: number;
  attended: number;
}

export interface MonthlyReportQuery {
  /** Cantidad de meses hacia atrás desde el actual, inclusive. Default 6, máximo 24. */
  months?: number;
}

export interface MonthlyReportEntryDto {
  /** "YYYY-MM". */
  month: string;
  totalAppointments: number;
  attended: number;
  noShow: number;
  cancelled: number;
  newPatients: number;
  newWaitlistEntries: number;
}
