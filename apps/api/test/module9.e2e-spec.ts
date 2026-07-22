import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-app';

const ADMIN_PASSWORD = 'AdminPass1';

describe('Módulo 9 · Reportes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAId: string;
  let orgBId: string;
  let profAId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);

    const orgA = await prisma.organization.create({
      data: { name: 'Centro E2E A', timezone: 'America/Santiago' },
    });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: { name: 'Centro E2E B', timezone: 'America/Santiago' },
    });
    orgBId = orgB.id;

    await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'admin@m9.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
      },
    });
    const profA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'prof@m9.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'A',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
      },
    });
    profAId = profA.id;

    await prisma.user.create({
      data: {
        organizationId: orgBId,
        email: 'admin-b@m9.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'B',
        role: 'ADMIN',
      },
    });

    const patientA = await prisma.patient.create({
      data: {
        organizationId: orgAId,
        firstName: 'Sofía',
        lastName: 'Gómez',
        rut: '12345678-5',
        birthDate: new Date('2018-03-20'),
        phone: '+56911111111',
      },
    });
    await prisma.patient.create({
      data: {
        organizationId: orgBId,
        firstName: 'Otro',
        lastName: 'Paciente',
        rut: '87654321-6',
        birthDate: new Date('2019-01-01'),
        phone: '+56922222222',
      },
    });

    await prisma.waitlistEntry.create({
      data: {
        organizationId: orgAId,
        childFirstName: 'Nuevo',
        childLastName: 'Ingreso',
        guardianName: 'Un Apoderado',
        guardianPhone: '+56933333333',
        status: 'PENDIENTE',
      },
    });

    await prisma.appointment.createMany({
      data: [
        {
          organizationId: orgAId,
          patientId: patientA.id,
          professionalId: profAId,
          date: new Date('2026-03-05'),
          startMinute: 9 * 60,
          durationMinutes: 45,
          status: 'ATENDIDA',
        },
        {
          organizationId: orgAId,
          patientId: patientA.id,
          professionalId: profAId,
          date: new Date('2026-03-10'),
          startMinute: 10 * 60,
          durationMinutes: 45,
          status: 'NO_ASISTIO',
        },
        {
          organizationId: orgAId,
          patientId: patientA.id,
          professionalId: profAId,
          date: new Date('2026-03-12'),
          startMinute: 11 * 60,
          durationMinutes: 45,
          status: 'CANCELADA',
        },
      ],
    });
  });

  function agent() {
    return request(app.getHttpServer());
  }

  async function loginAs(email: string, password: string) {
    const res = await agent().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  describe('RolesGuard', () => {
    it('rechaza a un PROFESSIONAL con 403 en todos los endpoints', async () => {
      const profCookies = await loginAs('prof@m9.cl', ADMIN_PASSWORD);
      await agent().get('/api/v1/reports/summary').set('Cookie', profCookies).expect(403);
      await agent().get('/api/v1/reports/attendance').set('Cookie', profCookies).expect(403);
      await agent().get('/api/v1/reports/monthly').set('Cookie', profCookies).expect(403);
    });
  });

  describe('GET /reports/summary', () => {
    it('cuenta pacientes activos, terapeutas activos y lista de espera pendiente, aislado por organización', async () => {
      const adminACookies = await loginAs('admin@m9.cl', ADMIN_PASSWORD);
      const summary = await agent()
        .get('/api/v1/reports/summary')
        .set('Cookie', adminACookies)
        .expect(200);
      expect(summary.body).toEqual({
        activePatients: 1,
        activeProfessionals: 1,
        pendingWaitlistEntries: 1,
      });

      const adminBCookies = await loginAs('admin-b@m9.cl', ADMIN_PASSWORD);
      const summaryB = await agent()
        .get('/api/v1/reports/summary')
        .set('Cookie', adminBCookies)
        .expect(200);
      expect(summaryB.body).toEqual({
        activePatients: 1,
        activeProfessionals: 0,
        pendingWaitlistEntries: 0,
      });
    });
  });

  describe('GET /reports/attendance', () => {
    it('cuenta atenciones, inasistencias y cancelaciones del rango solicitado', async () => {
      const adminCookies = await loginAs('admin@m9.cl', ADMIN_PASSWORD);
      const report = await agent()
        .get('/api/v1/reports/attendance')
        .query({ from: '2026-03-01', to: '2026-03-31' })
        .set('Cookie', adminCookies)
        .expect(200);
      expect(report.body).toMatchObject({
        total: 3,
        attended: 1,
        noShow: 1,
        cancelled: 1,
      });
    });

    it('un rango sin citas devuelve todo en cero', async () => {
      const adminCookies = await loginAs('admin@m9.cl', ADMIN_PASSWORD);
      const report = await agent()
        .get('/api/v1/reports/attendance')
        .query({ from: '2025-01-01', to: '2025-01-31' })
        .set('Cookie', adminCookies)
        .expect(200);
      expect(report.body.total).toBe(0);
    });
  });

  describe('GET /reports/monthly', () => {
    it('devuelve la cantidad de meses solicitada', async () => {
      const adminCookies = await loginAs('admin@m9.cl', ADMIN_PASSWORD);
      const monthly = await agent()
        .get('/api/v1/reports/monthly')
        .query({ months: 3 })
        .set('Cookie', adminCookies)
        .expect(200);
      expect(monthly.body).toHaveLength(3);
    });
  });
});
