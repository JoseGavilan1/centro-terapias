import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-app';

const ADMIN_PASSWORD = 'AdminPass1';
const ORG_A_TOKEN = 'intake-token-org-a';
const ORG_B_TOKEN = 'intake-token-org-b';

describe('Módulo 7 · Lista de espera (e2e)', () => {
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
      data: {
        name: 'Centro E2E A',
        timezone: 'America/Santiago',
        waitlistIntakeToken: ORG_A_TOKEN,
      },
    });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: {
        name: 'Centro E2E B',
        timezone: 'America/Santiago',
        waitlistIntakeToken: ORG_B_TOKEN,
      },
    });
    orgBId = orgB.id;

    await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'admin@m7.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        organizationId: orgBId,
        email: 'admin-b@m7.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'B',
        role: 'ADMIN',
      },
    });
    const profA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'prof@m7.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'A',
        role: 'PROFESSIONAL',
        specialty: 'FONOAUDIOLOGIA',
      },
    });
    profAId = profA.id;
  });

  function agent() {
    return request(app.getHttpServer());
  }

  async function loginAs(email: string, password: string) {
    const res = await agent().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  function intake(token: string | undefined, body: Record<string, unknown>) {
    const req = agent().post('/api/v1/webhooks/waitlist');
    if (token) req.set('X-Intake-Token', token);
    return req.send(body);
  }

  const validIntakeBody = {
    childFirstName: 'Martina',
    childLastName: 'Soto',
    guardianName: 'Paula Soto',
    guardianPhone: '+56911111111',
  };

  describe('Webhook de ingreso', () => {
    it('sin token → 401', async () => {
      await intake(undefined, validIntakeBody).expect(401);
    });

    it('con token inválido → 401', async () => {
      await intake('token-que-no-existe', validIntakeBody).expect(401);
    });

    it('con token válido → 201 y la entrada existe en la organización correcta', async () => {
      const res = await intake(ORG_A_TOKEN, validIntakeBody).expect(201);
      expect(res.body.status).toBe('PENDIENTE');

      const entry = await prisma.waitlistEntry.findUnique({ where: { id: res.body.id } });
      expect(entry?.organizationId).toBe(orgAId);
    });
  });

  describe('Aislamiento multi-tenant', () => {
    it('el token de la organización A nunca crea entradas en B; GET /waitlist de A no ve entradas de B', async () => {
      await intake(ORG_A_TOKEN, validIntakeBody).expect(201);
      await intake(ORG_B_TOKEN, { ...validIntakeBody, childFirstName: 'OtroNiño' }).expect(201);

      const adminACookies = await loginAs('admin@m7.cl', ADMIN_PASSWORD);
      const list = await agent().get('/api/v1/waitlist').set('Cookie', adminACookies).expect(200);
      const names = (list.body.data as Array<{ childFirstName: string }>).map(
        (e) => e.childFirstName,
      );
      expect(names).toEqual(['Martina']);
    });
  });

  describe('RolesGuard', () => {
    it('rechaza a un PROFESSIONAL con 403 en todo el CRUD de administración', async () => {
      const profCookies = await loginAs('prof@m7.cl', ADMIN_PASSWORD);
      await agent().get('/api/v1/waitlist').set('Cookie', profCookies).expect(403);
      await agent()
        .post('/api/v1/waitlist')
        .set('Cookie', profCookies)
        .send(validIntakeBody)
        .expect(403);
    });
  });

  describe('Flujo completo: intake → asignar → paciente y horario existen', () => {
    it('asigna, crea Patient + TherapySlot y la entrada deja de contar como pendiente', async () => {
      const adminCookies = await loginAs('admin@m7.cl', ADMIN_PASSWORD);

      const created = await intake(ORG_A_TOKEN, validIntakeBody).expect(201);
      const entryId = created.body.id as string;

      const pending = await agent()
        .get('/api/v1/waitlist')
        .query({ status: 'PENDIENTE' })
        .set('Cookie', adminCookies)
        .expect(200);
      const pendingIds = (pending.body.data as Array<{ id: string }>).map((e) => e.id);
      expect(pendingIds).toContain(entryId);

      const assigned = await agent()
        .patch(`/api/v1/waitlist/${entryId}/assign`)
        .set('Cookie', adminCookies)
        .send({
          professionalId: profAId,
          weekday: 'MONDAY',
          startTime: '09:00',
          durationMinutes: 45,
          validFrom: '2026-03-01',
          rut: '12345678-5',
          birthDate: '2019-05-10',
        })
        .expect(200);

      expect(assigned.body.status).toBe('ASIGNADA');
      const patientId = assigned.body.assignedPatientId as string;
      const slotId = assigned.body.assignedTherapySlotId as string;
      expect(patientId).toBeTruthy();
      expect(slotId).toBeTruthy();

      await agent().get(`/api/v1/patients/${patientId}`).set('Cookie', adminCookies).expect(200);

      const slots = await agent()
        .get('/api/v1/therapy-slots')
        .query({ patientId })
        .set('Cookie', adminCookies)
        .expect(200);
      expect(slots.body.data).toHaveLength(1);
      expect(slots.body.data[0].id).toBe(slotId);

      const pendingAfter = await agent()
        .get('/api/v1/waitlist')
        .query({ status: 'PENDIENTE' })
        .set('Cookie', adminCookies)
        .expect(200);
      const pendingAfterIds = (pendingAfter.body.data as Array<{ id: string }>).map((e) => e.id);
      expect(pendingAfterIds).not.toContain(entryId);
    });
  });

  describe('Descartar', () => {
    it('sin motivo → 400; con motivo → 200 y queda DESCARTADA', async () => {
      const adminCookies = await loginAs('admin@m7.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/waitlist')
        .set('Cookie', adminCookies)
        .send(validIntakeBody)
        .expect(201);
      const entryId = created.body.id as string;

      await agent()
        .patch(`/api/v1/waitlist/${entryId}/discard`)
        .set('Cookie', adminCookies)
        .send({})
        .expect(400);

      const discarded = await agent()
        .patch(`/api/v1/waitlist/${entryId}/discard`)
        .set('Cookie', adminCookies)
        .send({ reason: 'La familia no respondió' })
        .expect(200);
      expect(discarded.body.status).toBe('DESCARTADA');
      expect(discarded.body.discardReason).toBe('La familia no respondió');
    });
  });

  describe('PATCH /organizations/current', () => {
    it('acepta waitlistIntakeToken y OrganizationDto lo expone', async () => {
      const adminCookies = await loginAs('admin@m7.cl', ADMIN_PASSWORD);
      const updated = await agent()
        .patch('/api/v1/organizations/current')
        .set('Cookie', adminCookies)
        .send({ waitlistIntakeToken: 'nuevo-token-rotado' })
        .expect(200);
      expect(updated.body.waitlistIntakeToken).toBe('nuevo-token-rotado');

      const current = await agent()
        .get('/api/v1/organizations/current')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(current.body.waitlistIntakeToken).toBe('nuevo-token-rotado');
    });
  });
});
