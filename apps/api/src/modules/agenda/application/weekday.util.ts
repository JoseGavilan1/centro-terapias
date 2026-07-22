import { Weekday } from '@centro/shared';

const WEEKDAY_TO_JS_DAY: Record<Weekday, number> = {
  [Weekday.SUNDAY]: 0,
  [Weekday.MONDAY]: 1,
  [Weekday.TUESDAY]: 2,
  [Weekday.WEDNESDAY]: 3,
  [Weekday.THURSDAY]: 4,
  [Weekday.FRIDAY]: 5,
  [Weekday.SATURDAY]: 6,
};

/** true si dos rangos de vigencia (`validTo`/`to` nulo = sin fin) se intersectan. */
export function dateRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ?? new Date(8640000000000000);
  const bEnd = bTo ?? new Date(8640000000000000);
  return aFrom.getTime() <= bEnd.getTime() && bFrom.getTime() <= aEnd.getTime();
}

/**
 * Fechas concretas (UTC, medianoche) entre `from` y `to` (inclusive) cuyo día
 * de la semana coincide con `weekday` y caen dentro de la vigencia
 * `[validFrom, validTo]` del slot (`validTo` nulo = sin fin). Usado por
 * CU-03 (generación de instancias).
 */
export function enumerateWeekdayDates(
  from: Date,
  to: Date,
  weekday: Weekday,
  validFrom: Date,
  validTo: Date | null,
): Date[] {
  const targetDay = WEEKDAY_TO_JS_DAY[weekday];
  const rangeStart = from.getTime() > validFrom.getTime() ? from : validFrom;
  const rangeEnd = validTo && validTo.getTime() < to.getTime() ? validTo : to;

  const dates: Date[] = [];
  const cursor = new Date(rangeStart);
  while (cursor.getTime() <= rangeEnd.getTime()) {
    if (cursor.getUTCDay() === targetDay) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
