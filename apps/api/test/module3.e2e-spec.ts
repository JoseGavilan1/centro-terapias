import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-app';

const ADMIN_PASSWORD = 'AdminPass1';
const PROF_PASSWORD = 'ProfPass1';

const JS_DAY_TO_WEEKDAY = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

describe('Módulo 3 · Agenda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAId: string;
  let orgBId: string;
  let patientAId: string;
  let profAId: string;

  // "Hoy" real, para poder generar una instancia PENDIENTE de hoy y probar
  // la restricción de fecha de marcado de asistencia sin mockear el reloj.
  const today = new Date(toIsoDate(new Date()));
  const todayWeekday = JS_DAY_TO_WEEKDAY[today.getUTCDay()];
  const rangeFrom = toIsoDate(addDays(today, -7));
  const rangeTo = toIsoDate(addDays(today, 7));

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
        email: 'admin@m3.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        organizationId: orgBId,
        email: 'admin-b@m3.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'B',
        role: 'ADMIN',
      },
    });
    const profA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'prof-a@m3.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'A',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
      },
    });
    profAId = profA.id;
    await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'prof-b@m3.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'B',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
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
    patientAId = patientA.id;
    await prisma.patient.create({
      data: {
        organizationId: orgAId,
        firstName: 'Sin',
        lastName: 'Asignar',
        rut: '87654321-6',
        birthDate: new Date('2019-01-01'),
        phone: '+56922222222',
      },
    });
  });

  function agent() {
    return request(app.getHttpServer());
  }

  async function loginAs(email: string, password: string) {
    const res = await agent().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  function validSlot(overrides: Record<string, unknown> = {}) {
    return {
      patientId: patientAId,
      professionalId: profAId,
      weekday: todayWeekday,
      startTime: '09:00',
      durationMinutes: 45,
      validFrom: rangeFrom,
      ...overrides,
    };
  }

  describe('Ciclo completo ADMIN', () => {
    it('crea plantilla, genera instancias, confirma y marca asistencia', async () => {
      const cookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);

      const slot = await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', cookies)
        .send(validSlot())
        .expect(201);
      expect(slot.body.isActive).toBe(true);

      const generated = await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', cookies)
        .send({ from: rangeFrom, to: rangeTo })
        .expect(200);
      expect(generated.body.created).toBeGreaterThanOrEqual(1);

      const list = await agent()
        .get('/api/v1/appointments')
        .query({ patientId: patientAId, dateFrom: toIsoDate(today), dateTo: toIsoDate(today) })
        .set('Cookie', cookies)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      const appointmentId = list.body.data[0].id;
      expect(list.body.data[0].status).toBe('PENDIENTE');

      const confirmed = await agent()
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set('Cookie', cookies)
        .send({ status: 'CONFIRMADA' })
        .expect(200);
      expect(confirmed.body.status).toBe('CONFIRMADA');
      expect(confirmed.body.confirmedVia).toBe('MANUAL');

      const attended = await agent()
        .patch(`/api/v1/appointments/${appointmentId}/attendance`)
        .set('Cookie', cookies)
        .send({ status: 'ATENDIDA' })
        .expect(200);
      expect(attended.body.status).toBe('ATENDIDA');

      const logs = await prisma.auditLog.findMany({
        where: { organizationId: orgAId, entity: { in: ['TherapySlot', 'Appointment'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => `${l.entity}:${l.action}`)).toEqual([
        'TherapySlot:CREATE',
        'Appointment:CREATE',
        'Appointment:UPDATE',
        'Appointment:UPDATE',
      ]);
    });

    it('rechaza solapamiento y rango mayor a 60 días', async () => {
      const cookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', cookies)
        .send(validSlot())
        .expect(201);
      await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', cookies)
        .send(validSlot({ patientId: patientAId }))
        .expect(409);
      await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', cookies)
        .send({ from: '2026-01-01', to: '2026-12-31' })
        .expect(400);
    });

    it('la generación es idempotente sobre el mismo rango', async () => {
      const cookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', cookies)
        .send(validSlot())
        .expect(201);
      const first = await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', cookies)
        .send({ from: rangeFrom, to: rangeTo })
        .expect(200);
      const second = await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', cookies)
        .send({ from: rangeFrom, to: rangeTo })
        .expect(200);
      expect(second.body.created).toBe(0);
      expect(second.body.skipped).toBe(first.body.created);
    });

    it('desactivar un slot no afecta instancias ya generadas', async () => {
      const cookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);
      const slot = await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', cookies)
        .send(validSlot())
        .expect(201);
      await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', cookies)
        .send({ from: rangeFrom, to: rangeTo })
        .expect(200);
      await agent()
        .delete(`/api/v1/therapy-slots/${slot.body.id}`)
        .set('Cookie', cookies)
        .expect(204);

      const list = await agent()
        .get('/api/v1/appointments')
        .query({ patientId: patientAId })
        .set('Cookie', cookies)
        .expect(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RBAC', () => {
    it('un profesional recibe 403 en las mutaciones de agenda', async () => {
      const cookies = await loginAs('prof-a@m3.cl', PROF_PASSWORD);
      await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', cookies)
        .send(validSlot())
        .expect(403);
      await agent()
        .post('/api/v1/appointments')
        .set('Cookie', cookies)
        .send({
          patientId: patientAId,
          professionalId: profAId,
          date: rangeTo,
          startTime: '10:00',
          durationMinutes: 30,
        })
        .expect(403);
    });

    it('un profesional recibe 403 al confirmar/cancelar (solo asistencia está permitida)', async () => {
      const adminCookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);
      const slot = await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', adminCookies)
        .send(validSlot())
        .expect(201);
      await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', adminCookies)
        .send({ from: rangeFrom, to: rangeTo })
        .expect(200);
      const list = await agent()
        .get('/api/v1/appointments')
        .query({ patientId: patientAId })
        .set('Cookie', adminCookies)
        .expect(200);
      const appointmentId = list.body.data[0].id;

      const profCookies = await loginAs('prof-a@m3.cl', PROF_PASSWORD);
      await agent()
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set('Cookie', profCookies)
        .send({ status: 'CONFIRMADA' })
        .expect(403);
      void slot;
    });
  });

  describe('Alcance por profesional', () => {
    it('un profesional solo ve sus propias citas y no puede marcar asistencia de las ajenas', async () => {
      const adminCookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', adminCookies)
        .send(validSlot())
        .expect(201);
      await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', adminCookies)
        .send({ from: rangeFrom, to: rangeTo })
        .expect(200);
      const adminList = await agent()
        .get('/api/v1/appointments')
        .query({ patientId: patientAId, dateFrom: toIsoDate(today), dateTo: toIsoDate(today) })
        .set('Cookie', adminCookies)
        .expect(200);
      const appointmentId = adminList.body.data[0].id;

      const profBCookies = await loginAs('prof-b@m3.cl', PROF_PASSWORD);
      const profBList = await agent()
        .get('/api/v1/appointments')
        .set('Cookie', profBCookies)
        .expect(200);
      expect(profBList.body.data).toHaveLength(0);
      await agent()
        .patch(`/api/v1/appointments/${appointmentId}/attendance`)
        .set('Cookie', profBCookies)
        .send({ status: 'ATENDIDA' })
        .expect(404);

      const profACookies = await loginAs('prof-a@m3.cl', PROF_PASSWORD);
      const profAList = await agent()
        .get('/api/v1/appointments')
        .set('Cookie', profACookies)
        .expect(200);
      const profAAppointments = profAList.body.data as Array<{ professionalId: string }>;
      expect(profAAppointments.length).toBeGreaterThanOrEqual(1);
      expect(profAAppointments.every((a) => a.professionalId === profAId)).toBe(true);
    });
  });

  describe('Multi-tenant', () => {
    it('un admin de otra organización no puede ver ni editar slots/citas ajenos', async () => {
      const adminACookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);
      const slot = await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', adminACookies)
        .send(validSlot())
        .expect(201);

      const adminBCookies = await loginAs('admin-b@m3.cl', ADMIN_PASSWORD);
      await agent()
        .patch(`/api/v1/therapy-slots/${slot.body.id}`)
        .set('Cookie', adminBCookies)
        .send({ durationMinutes: 60 })
        .expect(404);
      await agent()
        .delete(`/api/v1/therapy-slots/${slot.body.id}`)
        .set('Cookie', adminBCookies)
        .expect(404);
    });
  });

  describe('Acceso a pacientes como PROFESSIONAL (cierra Módulo 2 §1.1)', () => {
    it('solo ve los pacientes con un slot activo asignado, y sin permisos de mutación', async () => {
      const adminCookies = await loginAs('admin@m3.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/therapy-slots')
        .set('Cookie', adminCookies)
        .send(validSlot())
        .expect(201);

      const profCookies = await loginAs('prof-a@m3.cl', PROF_PASSWORD);
      const list = await agent().get('/api/v1/patients').set('Cookie', profCookies).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(patientAId);

      await agent().get(`/api/v1/patients/${patientAId}`).set('Cookie', profCookies).expect(200);

      const otherPatient = await prisma.patient.findFirst({
        where: { organizationId: orgAId, id: { not: patientAId } },
      });
      await agent()
        .get(`/api/v1/patients/${otherPatient?.id}`)
        .set('Cookie', profCookies)
        .expect(404);

      await agent()
        .post('/api/v1/patients')
        .set('Cookie', profCookies)
        .send({
          firstName: 'X',
          lastName: 'Y',
          rut: '11111111-1',
          birthDate: '2020-01-01',
          phone: '+56933333333',
        })
        .expect(403);
      await agent()
        .patch(`/api/v1/patients/${patientAId}`)
        .set('Cookie', profCookies)
        .send({ firstName: 'Z' })
        .expect(403);
      await agent().delete(`/api/v1/patients/${patientAId}`).set('Cookie', profCookies).expect(403);
    });
  });
});
