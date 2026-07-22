/**
 * Rangos de fecha para los reportes de asistencia y rendimiento mensual (Módulo 9). Todo en UTC
 * medianoche, con límite superior exclusivo (`toExclusive`/`endExclusive`) para no depender de
 * "fin de día" al comparar contra columnas `timestamptz` (`Patient.createdAt`,
 * `WaitlistEntry.createdAt`) además de la columna `date` (`@db.Date`) de `Appointment`.
 */

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toMonthLabel(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export interface AttendanceRange {
  from: Date;
  toExclusive: Date;
}

/** Default: mes actual completo hasta hoy (inclusive). */
export function resolveAttendanceRange(
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): AttendanceRange {
  const start = from ? new Date(from) : startOfMonthUtc(now);
  const endInclusive = to
    ? new Date(to)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { from: start, toExclusive: addDaysUtc(endInclusive, 1) };
}

export interface MonthBoundary {
  month: string;
  start: Date;
  endExclusive: Date;
}

/** Los últimos `months` meses calendario, incluyendo el actual, del más antiguo al más reciente. */
export function buildMonthBoundaries(months: number, now: Date = new Date()): MonthBoundary[] {
  const currentMonthStart = startOfMonthUtc(now);
  const boundaries: MonthBoundary[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(
      Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - i, 1),
    );
    const endExclusive = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    boundaries.push({ month: toMonthLabel(start), start, endExclusive });
  }
  return boundaries;
}
