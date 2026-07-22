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

describe('Módulo 4 · Fichas clínicas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAId: string;
  let orgBId: string;
  let patientAId: string;
  let kineId: string;
  let psychId: string;
  let psych2Id: string;

  const today = new Date(toIsoDate(new Date()));
  const todayWeekday = JS_DAY_TO_WEEKDAY[today.getUTCDay()];

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
        email: 'admin@m4.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        organizationId: orgBId,
        email: 'admin-b@m4.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'B',
        role: 'ADMIN',
      },
    });
    const kine = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'kine@m4.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Kinesiólogo',
        lastName: 'A',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
      },
    });
    kineId = kine.id;
    const psych = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'psych@m4.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Psicóloga',
        lastName: 'Uno',
        role: 'PROFESSIONAL',
        specialty: 'PSICOLOGIA',
      },
    });
    psychId = psych.id;
    const psych2 = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'psych2@m4.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Psicóloga',
        lastName: 'Dos',
        role: 'PROFESSIONAL',
        specialty: 'PSICOLOGIA',
      },
    });
    psych2Id = psych2.id;

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
  });

  function agent() {
    return request(app.getHttpServer());
  }

  async function loginAs(email: string, password: string) {
    const res = await agent().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  /**
   * Crea un TherapySlot activo (vigencia abierta desde el pasado) entre patientA y el
   * profesional dado. `startTime` distinto por profesional evita el 409 de solapamiento del
   * Módulo 3 cuando un mismo paciente se asigna a varios profesionales en el mismo test.
   */
  async function assignPatient(
    adminCookies: string[],
    professionalId: string,
    startTime = '09:00',
  ) {
    await agent()
      .post('/api/v1/therapy-slots')
      .set('Cookie', adminCookies)
      .send({
        patientId: patientAId,
        professionalId,
        weekday: todayWeekday,
        startTime,
        durationMinutes: 30,
        validFrom: '2020-01-01',
      })
      .expect(201);
  }

  const validEvolution = {
    date: toIsoDate(today),
    observation: 'Buena evolución en la sesión de hoy.',
    workPlan: 'Continuar con ejercicios de coordinación.',
  };

  describe('Ciclo completo', () => {
    it('una evolución STANDARD es visible completa para su autor y para ADMIN', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m4.cl', PROF_PASSWORD);

      const created = await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send(validEvolution)
        .expect(201);
      expect(created.body.confidentiality).toBe('STANDARD');
      expect(created.body.redacted).toBe(false);

      const ownList = await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .expect(200);
      expect(ownList.body.data[0].observation).toBe(validEvolution.observation);

      const adminList = await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', adminCookies)
        .expect(200);
      expect(adminList.body.data[0].observation).toBe(validEvolution.observation);
    });

    it('un profesional sin el paciente asignado recibe 404, no una versión redactada', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m4.cl', PROF_PASSWORD);
      await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send(validEvolution)
        .expect(201);

      // psych nunca fue asignado a patientA.
      const psychCookies = await loginAs('psych@m4.cl', PROF_PASSWORD);
      await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', psychCookies)
        .expect(404);
      await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', psychCookies)
        .send(validEvolution)
        .expect(404);
    });
  });

  describe('Confidencialidad psicológica (ADR-04)', () => {
    it('solo un profesional con specialty=PSICOLOGIA lee el contenido; ni ADMIN lo lee', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId, '09:00');
      await assignPatient(adminCookies, psychId, '10:00');
      await assignPatient(adminCookies, psych2Id, '11:00');
      const psychCookies = await loginAs('psych@m4.cl', PROF_PASSWORD);

      const created = await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', psychCookies)
        .send(validEvolution)
        .expect(201);
      expect(created.body.confidentiality).toBe('PSYCHOLOGICAL');
      expect(created.body.redacted).toBe(false);
      expect(created.body.observation).toBe(validEvolution.observation);

      const adminView = await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions/${created.body.id}`)
        .set('Cookie', adminCookies)
        .expect(200);
      expect(adminView.body.redacted).toBe(true);
      expect(adminView.body.observation).toBeNull();
      expect(adminView.body.workPlan).toBeNull();

      const kineCookies = await loginAs('kine@m4.cl', PROF_PASSWORD);
      const kineView = await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions/${created.body.id}`)
        .set('Cookie', kineCookies)
        .expect(200);
      expect(kineView.body.redacted).toBe(true);

      const psych2Cookies = await loginAs('psych2@m4.cl', PROF_PASSWORD);
      const psych2View = await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions/${created.body.id}`)
        .set('Cookie', psych2Cookies)
        .expect(200);
      expect(psych2View.body.redacted).toBe(false);
      expect(psych2View.body.observation).toBe(validEvolution.observation);
    });
  });

  describe('RBAC', () => {
    it('ADMIN recibe 403 al intentar crear una evolución', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', adminCookies)
        .send(validEvolution)
        .expect(403);
    });
  });

  describe('Vínculo con la atención (Appointment)', () => {
    async function createAttendedAppointment(adminCookies: string[]) {
      await assignPatient(adminCookies, kineId);
      const slots = await agent()
        .get('/api/v1/therapy-slots')
        .set('Cookie', adminCookies)
        .expect(200);
      const slotId = slots.body.data[0].id;
      void slotId;
      await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', adminCookies)
        .send({ from: toIsoDate(today), to: toIsoDate(today) })
        .expect(200);
      const appointments = await agent()
        .get('/api/v1/appointments')
        .query({ patientId: patientAId, dateFrom: toIsoDate(today), dateTo: toIsoDate(today) })
        .set('Cookie', adminCookies)
        .expect(200);
      const appointmentId = appointments.body.data[0].id;
      await agent()
        .patch(`/api/v1/appointments/${appointmentId}/attendance`)
        .set('Cookie', adminCookies)
        .send({ status: 'ATENDIDA' })
        .expect(200);
      return appointmentId as string;
    }

    it('vincula la evolución a la cita ATENDIDA y evita una segunda evolución para la misma cita', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      const appointmentId = await createAttendedAppointment(adminCookies);
      const kineCookies = await loginAs('kine@m4.cl', PROF_PASSWORD);

      const created = await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send({ ...validEvolution, appointmentId })
        .expect(201);
      expect(created.body.appointmentId).toBe(appointmentId);

      await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send({ ...validEvolution, appointmentId })
        .expect(409);
    });

    it('rechaza vincular una cita que no está ATENDIDA', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      await agent()
        .post('/api/v1/therapy-slots/generate-appointments')
        .set('Cookie', adminCookies)
        .send({ from: toIsoDate(today), to: toIsoDate(today) })
        .expect(200);
      const appointments = await agent()
        .get('/api/v1/appointments')
        .query({ patientId: patientAId, dateFrom: toIsoDate(today), dateTo: toIsoDate(today) })
        .set('Cookie', adminCookies)
        .expect(200);
      const pendingAppointmentId = appointments.body.data[0].id;

      const kineCookies = await loginAs('kine@m4.cl', PROF_PASSWORD);
      await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send({ ...validEvolution, appointmentId: pendingAppointmentId })
        .expect(400);
    });

    it('rechaza vincular la cita ATENDIDA de otro profesional', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      const appointmentId = await createAttendedAppointment(adminCookies);
      await assignPatient(adminCookies, psychId, '11:00');
      const psychCookies = await loginAs('psych@m4.cl', PROF_PASSWORD);

      await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', psychCookies)
        .send({ ...validEvolution, appointmentId })
        .expect(400);
    });
  });

  describe('Multi-tenant', () => {
    it('una evolución de la organización A no es visible desde la organización B', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m4.cl', PROF_PASSWORD);
      const created = await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send(validEvolution)
        .expect(201);

      const adminBCookies = await loginAs('admin-b@m4.cl', ADMIN_PASSWORD);
      await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions/${created.body.id}`)
        .set('Cookie', adminBCookies)
        .expect(404);
      await agent()
        .get(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', adminBCookies)
        .expect(404);
    });
  });

  describe('Auditoría', () => {
    it('cada creación deja un registro CREATE en audit_logs; el de una PSYCHOLOGICAL no incluye contenido', async () => {
      const adminCookies = await loginAs('admin@m4.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId, '09:00');
      await assignPatient(adminCookies, psychId, '10:00');
      const kineCookies = await loginAs('kine@m4.cl', PROF_PASSWORD);
      const psychCookies = await loginAs('psych@m4.cl', PROF_PASSWORD);

      const standard = await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send(validEvolution)
        .expect(201);
      const psychological = await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', psychCookies)
        .send(validEvolution)
        .expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { entity: 'Evolution', entityId: { in: [standard.body.id, psychological.body.id] } },
      });
      expect(logs).toHaveLength(2);

      const standardLog = logs.find((l) => l.entityId === standard.body.id)!;
      const psychologicalLog = logs.find((l) => l.entityId === psychological.body.id)!;
      expect(standardLog.action).toBe('CREATE');
      expect((standardLog.newValue as Record<string, unknown>).observation).toBeDefined();
      expect((psychologicalLog.newValue as Record<string, unknown>).observation).toBeUndefined();
      expect((psychologicalLog.newValue as Record<string, unknown>).workPlan).toBeUndefined();
    });
  });
});
