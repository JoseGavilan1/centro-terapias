import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-app';

const ADMIN_PASSWORD = 'AdminPass1';
const ORG_A_PHONE_NUMBER_ID = 'wa-org-a-m8';
const ADMIN_A_PHONE = '+56900000001';

describe('Módulo 8 · Incidencias (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAId: string;
  let orgBId: string;
  let profAId: string;
  let assignedPatientId: string;
  let unassignedPatientId: string;

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
      data: {
        name: 'Centro E2E A',
        timezone: 'America/Santiago',
        whatsappPhoneNumberId: ORG_A_PHONE_NUMBER_ID,
      },
    });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: { name: 'Centro E2E B', timezone: 'America/Santiago' },
    });
    orgBId = orgB.id;

    await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'admin@m8.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
        phone: ADMIN_A_PHONE,
      },
    });
    await prisma.user.create({
      data: {
        organizationId: orgBId,
        email: 'admin-b@m8.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'B',
        role: 'ADMIN',
      },
    });
    const profA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'prof@m8.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'A',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
      },
    });
    profAId = profA.id;

    const assignedPatient = await prisma.patient.create({
      data: {
        organizationId: orgAId,
        firstName: 'Sofía',
        lastName: 'Gómez',
        rut: '12345678-5',
        birthDate: new Date('2018-03-20'),
        phone: '+56911111111',
      },
    });
    assignedPatientId = assignedPatient.id;
    await prisma.therapySlot.create({
      data: {
        organizationId: orgAId,
        patientId: assignedPatientId,
        professionalId: profAId,
        weekday: 'MONDAY',
        startMinute: 9 * 60,
        durationMinutes: 45,
        validFrom: new Date('2026-01-01'),
      },
    });

    const unassignedPatient = await prisma.patient.create({
      data: {
        organizationId: orgAId,
        firstName: 'Otro',
        lastName: 'Paciente',
        rut: '87654321-6',
        birthDate: new Date('2019-01-01'),
        phone: '+56922222222',
      },
    });
    unassignedPatientId = unassignedPatient.id;
  });

  function agent() {
    return request(app.getHttpServer());
  }

  async function loginAs(email: string, password: string) {
    const res = await agent().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  const baseBody = {
    type: 'ACCIDENTE',
    description: 'El paciente se golpeó la rodilla durante el ejercicio.',
    occurredAt: '2026-03-01T14:00:00.000Z',
  };

  describe('POST /incidents', () => {
    it('PROFESSIONAL reporta sin paciente y notifica al administrador por WhatsApp', async () => {
      const profCookies = await loginAs('prof@m8.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/incidents')
        .set('Cookie', profCookies)
        .send(baseBody)
        .expect(201);
      expect(created.body.status).toBe('ABIERTA');

      const notice = await prisma.whatsAppMessage.findFirst({
        where: {
          organizationId: orgAId,
          phone: ADMIN_A_PHONE,
          templateKey: 'ADMIN_INCIDENT_NOTICE',
        },
      });
      expect(notice).not.toBeNull();
    });

    it('PROFESSIONAL puede reportar sobre un paciente asignado', async () => {
      const profCookies = await loginAs('prof@m8.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/incidents')
        .set('Cookie', profCookies)
        .send({ ...baseBody, patientId: assignedPatientId })
        .expect(201);
      expect(created.body.patientId).toBe(assignedPatientId);
    });

    it('rechaza con 404 si el PROFESSIONAL no tiene asignado al paciente', async () => {
      const profCookies = await loginAs('prof@m8.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/incidents')
        .set('Cookie', profCookies)
        .send({ ...baseBody, patientId: unassignedPatientId })
        .expect(404);
    });

    it('ADMIN puede reportar sobre cualquier paciente de la organización', async () => {
      const adminCookies = await loginAs('admin@m8.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/incidents')
        .set('Cookie', adminCookies)
        .send({ ...baseBody, patientId: unassignedPatientId })
        .expect(201);
    });
  });

  describe('GET /incidents', () => {
    it('ADMIN ve todas las incidencias de su organización; PROFESSIONAL solo las que reportó', async () => {
      const adminCookies = await loginAs('admin@m8.cl', ADMIN_PASSWORD);
      const profCookies = await loginAs('prof@m8.cl', ADMIN_PASSWORD);

      await agent()
        .post('/api/v1/incidents')
        .set('Cookie', adminCookies)
        .send(baseBody)
        .expect(201);
      await agent().post('/api/v1/incidents').set('Cookie', profCookies).send(baseBody).expect(201);

      const asAdmin = await agent()
        .get('/api/v1/incidents')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(asAdmin.body.total).toBe(2);

      const asProf = await agent().get('/api/v1/incidents').set('Cookie', profCookies).expect(200);
      expect(asProf.body.total).toBe(1);
    });

    it('aislamiento multi-tenant: el admin de B nunca ve incidencias de A', async () => {
      const adminACookies = await loginAs('admin@m8.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/incidents')
        .set('Cookie', adminACookies)
        .send(baseBody)
        .expect(201);

      const adminBCookies = await loginAs('admin-b@m8.cl', ADMIN_PASSWORD);
      const asB = await agent().get('/api/v1/incidents').set('Cookie', adminBCookies).expect(200);
      expect(asB.body.total).toBe(0);
    });
  });

  describe('GET /incidents/:id', () => {
    it('PROFESSIONAL recibe 404 al pedir una incidencia que no reportó', async () => {
      const adminCookies = await loginAs('admin@m8.cl', ADMIN_PASSWORD);
      const profCookies = await loginAs('prof@m8.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/incidents')
        .set('Cookie', adminCookies)
        .send(baseBody)
        .expect(201);

      await agent()
        .get(`/api/v1/incidents/${created.body.id}`)
        .set('Cookie', profCookies)
        .expect(404);
    });
  });

  describe('PATCH /incidents/:id', () => {
    it('rechaza a un PROFESSIONAL con 403', async () => {
      const adminCookies = await loginAs('admin@m8.cl', ADMIN_PASSWORD);
      const profCookies = await loginAs('prof@m8.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/incidents')
        .set('Cookie', adminCookies)
        .send(baseBody)
        .expect(201);

      await agent()
        .patch(`/api/v1/incidents/${created.body.id}`)
        .set('Cookie', profCookies)
        .send({ status: 'EN_REVISION' })
        .expect(403);
    });

    it('ADMIN mueve ABIERTA -> EN_REVISION -> CERRADA; CERRADA es terminal', async () => {
      const adminCookies = await loginAs('admin@m8.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/incidents')
        .set('Cookie', adminCookies)
        .send(baseBody)
        .expect(201);

      await agent()
        .patch(`/api/v1/incidents/${created.body.id}`)
        .set('Cookie', adminCookies)
        .send({ status: 'EN_REVISION' })
        .expect(200);

      const closed = await agent()
        .patch(`/api/v1/incidents/${created.body.id}`)
        .set('Cookie', adminCookies)
        .send({ status: 'CERRADA' })
        .expect(200);
      expect(closed.body.status).toBe('CERRADA');

      await agent()
        .patch(`/api/v1/incidents/${created.body.id}`)
        .set('Cookie', adminCookies)
        .send({ status: 'ABIERTA' })
        .expect(409);
    });
  });
});
