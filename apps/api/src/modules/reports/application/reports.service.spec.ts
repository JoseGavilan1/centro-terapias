import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ReportsService } from './reports.service';

const ORG_ID = 'org-1';

class FakePrismaService {
  patientCountResult = 3;
  userCountResult = 2;
  waitlistCountResult = 4;
  groupByResult: Array<{ status: string; _count: number }> = [
    { status: 'ATENDIDA', _count: 5 },
    { status: 'NO_ASISTIO', _count: 2 },
    { status: 'CANCELADA', _count: 1 },
    { status: 'PENDIENTE', _count: 3 },
  ];

  patientCountCalls: unknown[] = [];
  waitlistCountCalls: unknown[] = [];
  groupByCalls: unknown[] = [];

  patient = {
    count: (args: unknown) => {
      this.patientCountCalls.push(args);
      return Promise.resolve(this.patientCountResult);
    },
  };
  user = {
    count: () => Promise.resolve(this.userCountResult),
  };
  waitlistEntry = {
    count: (args: unknown) => {
      this.waitlistCountCalls.push(args);
      return Promise.resolve(this.waitlistCountResult);
    },
  };
  appointment = {
    groupBy: (args: unknown) => {
      this.groupByCalls.push(args);
      return Promise.resolve(this.groupByResult);
    },
  };
}

describe('ReportsService', () => {
  let prisma: FakePrismaService;
  let service: ReportsService;

  beforeEach(() => {
    prisma = new FakePrismaService();
    service = new ReportsService(prisma as unknown as PrismaService);
  });

  describe('getSummary', () => {
    it('mapea los conteos de pacientes activos, profesionales activos y lista de espera pendiente', async () => {
      const summary = await service.getSummary(ORG_ID);
      expect(summary).toEqual({
        activePatients: 3,
        activeProfessionals: 2,
        pendingWaitlistEntries: 4,
      });
    });
  });

  describe('getAttendance', () => {
    it('suma el total y mapea cada estado a su campo', async () => {
      const report = await service.getAttendance(ORG_ID, {});
      expect(report.total).toBe(11);
      expect(report.attended).toBe(5);
      expect(report.noShow).toBe(2);
      expect(report.cancelled).toBe(1);
      expect(report.pending).toBe(3);
      expect(report.confirmed).toBe(0);
      expect(report.overbooked).toBe(0);
    });

    it('usa el rango explícito recibido', async () => {
      const report = await service.getAttendance(ORG_ID, { from: '2026-01-01', to: '2026-01-31' });
      expect(report.from).toBe('2026-01-01');
      expect(report.to).toBe('2026-01-31');
    });
  });

  describe('getMonthly', () => {
    it('devuelve una entrada por cada mes solicitado, con las etiquetas correctas', async () => {
      const entries = await service.getMonthly(ORG_ID, { months: 3 });
      expect(entries).toHaveLength(3);
      expect(entries.every((e) => e.totalAppointments === 11)).toBe(true);
      expect(entries.every((e) => e.newPatients === 3)).toBe(true);
      expect(entries.every((e) => e.newWaitlistEntries === 4)).toBe(true);
      // Meses consecutivos y en orden ascendente.
      const [m1, m2, m3] = entries.map((e) => e.month);
      expect([m1, m2, m3].every((m) => /^\d{4}-\d{2}$/.test(m))).toBe(true);
      expect(m1 < m2 && m2 < m3).toBe(true);
    });

    it('usa el default (6 meses) cuando no se especifica', async () => {
      const entries = await service.getMonthly(ORG_ID, {});
      expect(entries).toHaveLength(6);
    });

    it('respeta el máximo permitido aunque se pida más', async () => {
      const entries = await service.getMonthly(ORG_ID, { months: 999 });
      expect(entries).toHaveLength(24);
    });
  });
});
