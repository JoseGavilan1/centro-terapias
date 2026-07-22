import { INestApplication } from '@nestjs/common';
import { Weekday } from '@prisma/client';
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

const PDF_CONTENT = Buffer.from('%PDF-1.4 contenido de prueba');

describe('Módulo 5 · Documentos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAId: string;
  let orgBId: string;
  let patientAId: string;
  let kineId: string;
  let psychId: string;

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
        email: 'admin@m5.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        organizationId: orgBId,
        email: 'admin-b@m5.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'B',
        role: 'ADMIN',
      },
    });
    const kine = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'kine@m5.cl',
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
        email: 'psych@m5.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Psicóloga',
        lastName: 'Uno',
        role: 'PROFESSIONAL',
        specialty: 'PSICOLOGIA',
      },
    });
    psychId = psych.id;

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

  function uploadDocument(
    cookies: string[],
    overrides: {
      category?: string;
      evolutionId?: string;
      filename?: string;
      contentType?: string;
      content?: Buffer;
    } = {},
  ) {
    const req = agent()
      .post(`/api/v1/patients/${patientAId}/documents`)
      .set('Cookie', cookies)
      .field('category', overrides.category ?? 'INFORME');
    if (overrides.evolutionId) {
      req.field('evolutionId', overrides.evolutionId);
    }
    return req.attach('file', overrides.content ?? PDF_CONTENT, {
      filename: overrides.filename ?? 'informe.pdf',
      contentType: overrides.contentType ?? 'application/pdf',
    });
  }

  describe('Ciclo completo', () => {
    it('sube un documento, asigna driveFolderId al paciente y aparece en el listado', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);

      const patientBefore = await prisma.patient.findUnique({ where: { id: patientAId } });
      expect(patientBefore?.driveFolderId).toBeNull();

      const created = await uploadDocument(kineCookies).expect(201);
      expect(created.body.confidentiality).toBe('STANDARD');
      expect(created.body.redacted).toBe(false);
      expect(created.body.name).toBe('informe.pdf');

      const patientAfter = await prisma.patient.findUnique({ where: { id: patientAId } });
      expect(patientAfter?.driveFolderId).not.toBeNull();

      const list = await agent()
        .get(`/api/v1/patients/${patientAId}/documents`)
        .set('Cookie', kineCookies)
        .expect(200);
      expect(list.body.data).toHaveLength(1);

      const adminList = await agent()
        .get(`/api/v1/patients/${patientAId}/documents`)
        .set('Cookie', adminCookies)
        .expect(200);
      expect(adminList.body.data).toHaveLength(1);
    });
  });

  describe('Confidencialidad psicológica (ADR-04)', () => {
    it('solo un psicólogo descarga el contenido; ni ADMIN ni otro profesional pueden', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId, '09:00');
      await assignPatient(adminCookies, psychId, '10:00');
      const psychCookies = await loginAs('psych@m5.cl', PROF_PASSWORD);

      const created = await uploadDocument(psychCookies, { category: 'INFORME' }).expect(201);
      expect(created.body.confidentiality).toBe('PSYCHOLOGICAL');

      const adminView = await agent()
        .get(`/api/v1/patients/${patientAId}/documents`)
        .set('Cookie', adminCookies)
        .expect(200);
      expect(adminView.body.data[0].redacted).toBe(true);
      expect(adminView.body.data[0].name).toBeNull();

      await agent()
        .get(`/api/v1/patients/${patientAId}/documents/${created.body.id}/download`)
        .set('Cookie', adminCookies)
        .expect(403);

      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);
      await agent()
        .get(`/api/v1/patients/${patientAId}/documents/${created.body.id}/download`)
        .set('Cookie', kineCookies)
        .expect(403);

      const download = await agent()
        .get(`/api/v1/patients/${patientAId}/documents/${created.body.id}/download`)
        .set('Cookie', psychCookies)
        .expect(200);
      expect(download.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('RBAC', () => {
    it('ADMIN recibe 403 al intentar subir un documento', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      await uploadDocument(adminCookies).expect(403);
    });
  });

  describe('Validación de archivo', () => {
    it('rechaza un tipo de archivo no permitido', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);
      await uploadDocument(kineCookies, {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload',
        content: Buffer.from('binario'),
      }).expect(400);
    });

    it('rechaza un archivo que excede el tamaño máximo', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);
      const oversized = Buffer.alloc(16 * 1024 * 1024, 1);
      await uploadDocument(kineCookies, { content: oversized }).expect(400);
    });
  });

  describe('Vínculo con evolución', () => {
    it('permite adjuntar un documento a una evolución del mismo paciente', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);
      const evolution = await agent()
        .post(`/api/v1/patients/${patientAId}/evolutions`)
        .set('Cookie', kineCookies)
        .send({ date: toIsoDate(today), observation: 'obs', workPlan: 'plan' })
        .expect(201);

      const created = await uploadDocument(kineCookies, { evolutionId: evolution.body.id }).expect(
        201,
      );
      expect(created.body.evolutionId).toBe(evolution.body.id);
    });

    it('rechaza un evolutionId de otro paciente', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);

      const otherPatient = await prisma.patient.create({
        data: {
          organizationId: orgAId,
          firstName: 'Otro',
          lastName: 'Paciente',
          rut: '87654321-6',
          birthDate: new Date('2019-01-01'),
          phone: '+56922222222',
        },
      });
      await prisma.therapySlot.create({
        data: {
          organizationId: orgAId,
          patientId: otherPatient.id,
          professionalId: kineId,
          weekday: todayWeekday as Weekday,
          startMinute: 12 * 60,
          durationMinutes: 30,
          validFrom: new Date('2020-01-01'),
        },
      });
      const evolutionOther = await agent()
        .post(`/api/v1/patients/${otherPatient.id}/evolutions`)
        .set('Cookie', kineCookies)
        .send({ date: toIsoDate(today), observation: 'obs', workPlan: 'plan' })
        .expect(201);

      await uploadDocument(kineCookies, { evolutionId: evolutionOther.body.id }).expect(400);
    });
  });

  describe('Multi-tenant', () => {
    it('un documento de la organización A no es visible ni descargable desde la organización B', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);
      const created = await uploadDocument(kineCookies).expect(201);

      const adminBCookies = await loginAs('admin-b@m5.cl', ADMIN_PASSWORD);
      await agent()
        .get(`/api/v1/patients/${patientAId}/documents`)
        .set('Cookie', adminBCookies)
        .expect(404);
      await agent()
        .get(`/api/v1/patients/${patientAId}/documents/${created.body.id}/download`)
        .set('Cookie', adminBCookies)
        .expect(404);
    });
  });

  describe('Alcance por profesional', () => {
    it('un profesional sin el paciente asignado recibe 404 al listar y al subir', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      // psych nunca fue asignado a patientA.
      const psychCookies = await loginAs('psych@m5.cl', PROF_PASSWORD);
      await agent()
        .get(`/api/v1/patients/${patientAId}/documents`)
        .set('Cookie', psychCookies)
        .expect(404);
      await uploadDocument(psychCookies).expect(404);
    });
  });

  describe('Auditoría', () => {
    it('cada subida deja un registro CREATE en audit_logs con entity=Document', async () => {
      const adminCookies = await loginAs('admin@m5.cl', ADMIN_PASSWORD);
      await assignPatient(adminCookies, kineId);
      const kineCookies = await loginAs('kine@m5.cl', PROF_PASSWORD);
      const created = await uploadDocument(kineCookies).expect(201);

      const logs = await prisma.auditLog.findMany({
        where: { entity: 'Document', entityId: created.body.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('CREATE');
    });
  });
});
