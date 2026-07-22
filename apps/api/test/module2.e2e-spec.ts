import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-app';

const ADMIN_PASSWORD = 'AdminPass1';
const PROF_PASSWORD = 'ProfPass1';

describe('Módulo 2 · Pacientes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAId: string;
  let orgBId: string;

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
        email: 'admin@e2e.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        organizationId: orgBId,
        email: 'admin-b@e2e.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'B',
        role: 'ADMIN',
      },
    });
    await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'prof@e2e.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'E2E',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
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

  const validPatient = {
    firstName: 'Sofía',
    lastName: 'Gómez',
    rut: '12345678-5',
    birthDate: '2018-03-20',
    phone: '+56911111111',
  };

  describe('RBAC', () => {
    // Desde el Módulo 3 (§1.2), GET /patients ya no es 403 general para
    // PROFESSIONAL: responde filtrado por sus pacientes asignados (aquí,
    // ninguno). Las mutaciones siguen siendo exclusivas de ADMIN.
    it('un profesional recibe 200 filtrado en GET pero 403 en las mutaciones de /patients', async () => {
      const cookies = await loginAs('prof@e2e.cl', PROF_PASSWORD);
      const list = await agent().get('/api/v1/patients').set('Cookie', cookies).expect(200);
      expect(list.body.data).toHaveLength(0);
      await agent().post('/api/v1/patients').set('Cookie', cookies).send(validPatient).expect(403);
    });

    it('sin sesión responde 401', async () => {
      await agent().get('/api/v1/patients').expect(401);
    });
  });

  describe('POST /patients', () => {
    it('crea un paciente válido', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const res = await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send(validPatient)
        .expect(201);
      expect(res.body.rut).toBe('12345678-5');
      expect(res.body.isActive).toBe(true);
      expect(res.body.driveFolderId).toBeUndefined();
    });

    it('normaliza un RUT con puntos y minúscula antes de persistir', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const res = await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send({ ...validPatient, rut: '12.345.678-5' })
        .expect(201);
      expect(res.body.rut).toBe('12345678-5');
    });

    it('rechaza un RUT con dígito verificador inválido', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send({ ...validPatient, rut: '12345678-9' })
        .expect(400);
    });

    it('rechaza una fecha de nacimiento futura', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send({ ...validPatient, birthDate: future })
        .expect(400);
    });

    it('rechaza un RUT duplicado en la misma organización', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      await agent().post('/api/v1/patients').set('Cookie', cookies).send(validPatient).expect(201);
      await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send({ ...validPatient, firstName: 'Otro' })
        .expect(409);
    });

    it('permite el mismo RUT en organizaciones distintas', async () => {
      const cookiesA = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const cookiesB = await loginAs('admin-b@e2e.cl', ADMIN_PASSWORD);
      await agent().post('/api/v1/patients').set('Cookie', cookiesA).send(validPatient).expect(201);
      await agent().post('/api/v1/patients').set('Cookie', cookiesB).send(validPatient).expect(201);
    });
  });

  describe('GET /patients', () => {
    it('lista y filtra por búsqueda y estado, aislado por organización', async () => {
      const cookiesA = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const cookiesB = await loginAs('admin-b@e2e.cl', ADMIN_PASSWORD);
      await agent().post('/api/v1/patients').set('Cookie', cookiesA).send(validPatient).expect(201);
      await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookiesB)
        .send({ ...validPatient, firstName: 'Paciente', lastName: 'DeB' })
        .expect(201);

      const listA = await agent().get('/api/v1/patients').set('Cookie', cookiesA).expect(200);
      expect(listA.body.data).toHaveLength(1);
      expect(listA.body.data[0].firstName).toBe('Sofía');

      const bySearch = await agent()
        .get('/api/v1/patients')
        .query({ search: '12345678' })
        .set('Cookie', cookiesA)
        .expect(200);
      expect(bySearch.body.data).toHaveLength(1);
    });
  });

  describe('PATCH /patients/:id', () => {
    it('edita datos y permite reactivar vía isActive', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send(validPatient)
        .expect(201);

      const updated = await agent()
        .patch(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookies)
        .send({ diagnosis: 'TEL', isActive: false })
        .expect(200);
      expect(updated.body.diagnosis).toBe('TEL');
      expect(updated.body.isActive).toBe(false);

      const reactivated = await agent()
        .patch(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookies)
        .send({ isActive: true })
        .expect(200);
      expect(reactivated.body.isActive).toBe(true);
    });

    it('conservar el propio RUT en el PATCH no genera 409', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send(validPatient)
        .expect(201);
      await agent()
        .patch(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookies)
        .send({ rut: validPatient.rut })
        .expect(200);
    });

    it('404 sobre un id de otra organización', async () => {
      const cookiesA = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const cookiesB = await loginAs('admin-b@e2e.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookiesA)
        .send(validPatient)
        .expect(201);

      await agent()
        .patch(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookiesB)
        .send({ firstName: 'Hackeado' })
        .expect(404);
      await agent().get(`/api/v1/patients/${created.body.id}`).set('Cookie', cookiesB).expect(404);
    });
  });

  describe('DELETE /patients/:id', () => {
    it('desactiva sin borrar la fila, de forma idempotente', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send(validPatient)
        .expect(201);

      await agent()
        .delete(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookies)
        .expect(204);
      await agent()
        .delete(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookies)
        .expect(204);

      const row = await prisma.patient.findUnique({ where: { id: created.body.id } });
      expect(row).not.toBeNull();
      expect(row?.isActive).toBe(false);
    });
  });

  describe('Auditoría', () => {
    it('cada mutación de Patient queda en audit_logs con entity=Patient', async () => {
      const cookies = await loginAs('admin@e2e.cl', ADMIN_PASSWORD);
      const created = await agent()
        .post('/api/v1/patients')
        .set('Cookie', cookies)
        .send(validPatient)
        .expect(201);
      await agent()
        .patch(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookies)
        .send({ diagnosis: 'TEL' })
        .expect(200);
      await agent()
        .delete(`/api/v1/patients/${created.body.id}`)
        .set('Cookie', cookies)
        .expect(204);

      const logs = await prisma.auditLog.findMany({
        where: { entity: 'Patient', entityId: created.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
    });
  });
});
