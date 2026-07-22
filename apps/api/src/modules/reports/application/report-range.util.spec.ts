import { buildMonthBoundaries, resolveAttendanceRange } from './report-range.util';

describe('resolveAttendanceRange', () => {
  const now = new Date('2026-03-15T10:00:00Z');

  it('default: desde el primer día del mes actual hasta hoy (inclusive)', () => {
    const { from, toExclusive } = resolveAttendanceRange(undefined, undefined, now);
    expect(from.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(toExclusive.toISOString().slice(0, 10)).toBe('2026-03-16');
  });

  it('respeta from/to explícitos', () => {
    const { from, toExclusive } = resolveAttendanceRange('2026-01-01', '2026-01-31', now);
    expect(from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(toExclusive.toISOString().slice(0, 10)).toBe('2026-02-01');
  });
});

describe('buildMonthBoundaries', () => {
  it('devuelve los últimos N meses, del más antiguo al más reciente, incluyendo el actual', () => {
    const now = new Date('2026-03-15T10:00:00Z');
    const boundaries = buildMonthBoundaries(3, now);

    expect(boundaries.map((b) => b.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(boundaries[2].start.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(boundaries[2].endExclusive.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('cruza el límite de año correctamente', () => {
    const now = new Date('2026-01-15T10:00:00Z');
    const boundaries = buildMonthBoundaries(3, now);
    expect(boundaries.map((b) => b.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});
