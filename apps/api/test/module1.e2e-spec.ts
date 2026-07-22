import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AuditAction, UserRole } from '@centro/shared';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-app';

const ADMIN_PASSWORD = 'AdminPass1';
const PROF_PASSWORD = 'ProfPass1';

describe('Módulo 1 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let adminId: string;
  let professionalId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);

    const org = await prisma.organization.create({
      data: { name: 'Centro E2E', timezone: 'America/Santiago' },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: 'admin@e2e.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'E2E',
        role: 'ADMIN',
      },
    });
    adminId = admin.id;

    const professional = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: 'prof@e2e.cl',
        passwordHash: await bcrypt.hash(PROF_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'E2E',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
      },
    });
    professionalId = professional.id;
  });

  function agent() {
    return request(app.getHttpServer());
  }

  async function loginAdmin() {
    const res = await agent()
      .post('/api/v1/auth/login')
      .send({ email: 'admin@e2e.cl', password: ADMIN_PASSWORD })
      .expect(200);
    return res;
  }

  describe('POST /auth/login', () => {
    it('rechaza credenciales inválidas con 401 genérico', async () => {
      const res = await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'admin@e2e.cl', password: 'incorrecta' })
        .expect(401);
      expect(res.body.message).toBe('Credenciales inválidas');
    });

    it('rechaza un email inexistente con el mismo 401 genérico y lo audita', async () => {
      await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'no-existe@e2e.cl', password: 'lo-que-sea' })
        .expect(401);

      const logs = await prisma.auditLog.findMany({ where: { action: 'LOGIN_FAILED' } });
      expect(logs).toHaveLength(1);
      expect(logs[0].organizationId).toBeNull();
    });

    it('inicia sesión y emite cookies httpOnly', async () => {
      const res = await loginAdmin();
      expect(res.body.user.email).toBe('admin@e2e.cl');
      expect(res.body.user.role).toBe(UserRole.ADMIN);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('ct_access=') && c.includes('HttpOnly'))).toBe(true);
      expect(cookies.some((c) => c.startsWith('ct_refresh=') && c.includes('HttpOnly'))).toBe(true);
    });
  });

  describe('GET /auth/me', () => {
    it('rechaza sin sesión', async () => {
      await agent().get('/api/v1/auth/me').expect(401);
    });

    it('devuelve el usuario autenticado', async () => {
      const login = await loginAdmin();
      const cookies = login.headers['set-cookie'];
      const res = await agent().get('/api/v1/auth/me').set('Cookie', cookies).expect(200);
      expect(res.body.email).toBe('admin@e2e.cl');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rota el refresh token y el anterior ya no sirve', async () => {
      const login = await loginAdmin();
      const firstCookies = login.headers['set-cookie'] as unknown as string[];

      const refreshed = await agent().post('/api/v1/auth/refresh').set('Cookie', firstCookies).expect(200);
      const secondCookies = refreshed.headers['set-cookie'] as unknown as string[];
      expect(secondCookies).toBeDefined();

      // El primer refresh token ya fue rotado: reutilizarlo debe ser reuso.
      await agent().post('/api/v1/auth/refresh').set('Cookie', firstCookies).expect(401);
    });

    it('detecta reuso y revoca todas las sesiones del usuario', async () => {
      const login = await loginAdmin();
      const cookies = login.headers['set-cookie'] as unknown as string[];

      await agent().post('/api/v1/auth/refresh').set('Cookie', cookies).expect(200);
      await agent().post('/api/v1/auth/refresh').set('Cookie', cookies).expect(401);

      const reuseLogs = await prisma.auditLog.findMany({
        where: { action: 'TOKEN_REUSE_DETECTED' as AuditAction },
      });
      expect(reuseLogs).toHaveLength(1);

      const activeSessions = await prisma.refreshToken.count({
        where: { userId: adminId, revokedAt: null },
      });
      expect(activeSessions).toBe(0);
    });

    it('bajo refresh concurrentes reales con el mismo token, nunca ganan los dos', async () => {
      const login = await loginAdmin();
      const cookies = login.headers['set-cookie'] as unknown as string[];

      const [first, second] = await Promise.all([
        agent().post('/api/v1/auth/refresh').set('Cookie', cookies),
        agent().post('/api/v1/auth/refresh').set('Cookie', cookies),
      ]);
      const statuses = [first.status, second.status].sort();
      // Exactamente uno rota con éxito; el otro nunca recibe un token válido,
      // sea porque perdió la revocación atómica (login inválido, 401) o
      // porque su SELECT llegó después de que el primero ya rotó y lo
      // interpretó como reuso (revoca todo, también válido).
      expect(statuses).toEqual([200, 401]);

      // Nunca deben quedar 2 sesiones activas (que sería el bug original:
      // dos requests concurrentes obteniendo cada una un token válido del
      // mismo refresh). 0 (reuso conservador) o 1 (carrera limpia) son
      // ambos resultados correctos según el timing exacto de la carrera.
      const activeSessions = await prisma.refreshToken.count({
        where: { userId: adminId, revokedAt: null },
      });
      expect(activeSessions).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca la sesión y limpia las cookies', async () => {
      const login = await loginAdmin();
      const cookies = login.headers['set-cookie'] as unknown as string[];

      await agent().post('/api/v1/auth/logout').set('Cookie', cookies).expect(204);
      await agent().post('/api/v1/auth/refresh').set('Cookie', cookies).expect(401);
    });
  });

  describe('POST /auth/change-password', () => {
    it('rechaza si la contraseña actual es incorrecta', async () => {
      const login = await loginAdmin();
      const cookies = login.headers['set-cookie'];
      await agent()
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookies)
        .send({ currentPassword: 'mala', newPassword: 'NuevaClave1' })
        .expect(401);
    });

    it('cambia la contraseña, mantiene la sesión actual y revoca las demás', async () => {
      const sessionA = await loginAdmin();
      const sessionB = await loginAdmin();
      const cookiesA = sessionA.headers['set-cookie'] as unknown as string[];
      const cookiesB = sessionB.headers['set-cookie'] as unknown as string[];

      await agent()
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookiesA)
        .send({ currentPassword: ADMIN_PASSWORD, newPassword: 'NuevaClave1' })
        .expect(204);

      // La sesión que hizo el cambio sigue viva.
      await agent().post('/api/v1/auth/refresh').set('Cookie', cookiesA).expect(200);
      // La otra sesión del mismo usuario fue revocada.
      await agent().post('/api/v1/auth/refresh').set('Cookie', cookiesB).expect(401);

      await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'admin@e2e.cl', password: 'NuevaClave1' })
        .expect(200);
    });
  });

  describe('Autorización por rol', () => {
    it('un profesional recibe 403 al listar usuarios', async () => {
      const login = await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'prof@e2e.cl', password: PROF_PASSWORD })
        .expect(200);
      await agent().get('/api/v1/users').set('Cookie', login.headers['set-cookie']).expect(403);
    });
  });

  describe('CRUD de usuarios (ADMIN)', () => {
    it('rechaza crear un profesional sin especialidad', async () => {
      const login = await loginAdmin();
      await agent()
        .post('/api/v1/users')
        .set('Cookie', login.headers['set-cookie'])
        .send({
          email: 'nuevo@e2e.cl',
          firstName: 'N',
          lastName: 'N',
          role: UserRole.PROFESSIONAL,
          temporaryPassword: 'Abcdef12',
        })
        .expect(400);
    });

    it('crea un usuario, lo desactiva y ya no puede iniciar sesión', async () => {
      const login = await loginAdmin();
      const cookies = login.headers['set-cookie'];

      const created = await agent()
        .post('/api/v1/users')
        .set('Cookie', cookies)
        .send({
          email: 'nuevo@e2e.cl',
          firstName: 'Nuevo',
          lastName: 'Usuario',
          role: UserRole.PROFESSIONAL,
          specialty: 'PSICOLOGIA',
          temporaryPassword: 'Abcdef12',
        })
        .expect(201);
      expect(created.body.mustChangePassword).toBe(true);

      await agent().delete(`/api/v1/users/${created.body.id}`).set('Cookie', cookies).expect(204);

      await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'nuevo@e2e.cl', password: 'Abcdef12' })
        .expect(401);
    });

    it('impide que el administrador se desactive a sí mismo', async () => {
      const login = await loginAdmin();
      await agent()
        .delete(`/api/v1/users/${adminId}`)
        .set('Cookie', login.headers['set-cookie'])
        .expect(409);
    });

    it('restablece la contraseña y revoca las sesiones del usuario objetivo', async () => {
      const adminLogin = await loginAdmin();
      const profLogin = await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'prof@e2e.cl', password: PROF_PASSWORD })
        .expect(200);

      await agent()
        .post(`/api/v1/users/${professionalId}/reset-password`)
        .set('Cookie', adminLogin.headers['set-cookie'])
        .send({ temporaryPassword: 'NuevaTemp1' })
        .expect(204);

      await agent()
        .post('/api/v1/auth/refresh')
        .set('Cookie', profLogin.headers['set-cookie'] as unknown as string[])
        .expect(401);

      await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'prof@e2e.cl', password: 'NuevaTemp1' })
        .expect(200);
    });

    it('impide que el administrador se restablezca la contraseña a sí mismo', async () => {
      const login = await loginAdmin();
      await agent()
        .post(`/api/v1/users/${adminId}/reset-password`)
        .set('Cookie', login.headers['set-cookie'])
        .send({ temporaryPassword: 'OtraTemp12' })
        .expect(409);
    });

    it('permite cambiar a ADMIN sin enviar specialty, y la anula', async () => {
      const login = await loginAdmin();
      const res = await agent()
        .patch(`/api/v1/users/${professionalId}`)
        .set('Cookie', login.headers['set-cookie'])
        .send({ role: UserRole.ADMIN })
        .expect(200);
      expect(res.body.role).toBe(UserRole.ADMIN);
      expect(res.body.specialty).toBeNull();
    });
  });

  describe('Organización', () => {
    it('un profesional puede leer pero no editar la organización', async () => {
      const login = await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'prof@e2e.cl', password: PROF_PASSWORD })
        .expect(200);
      const cookies = login.headers['set-cookie'];

      await agent().get('/api/v1/organizations/current').set('Cookie', cookies).expect(200);
      await agent()
        .patch('/api/v1/organizations/current')
        .set('Cookie', cookies)
        .send({ name: 'Otro nombre' })
        .expect(403);
    });

    it('el administrador puede editar la organización y queda auditado', async () => {
      const login = await loginAdmin();
      await agent()
        .patch('/api/v1/organizations/current')
        .set('Cookie', login.headers['set-cookie'])
        .send({ name: 'Centro E2E Renombrado' })
        .expect(200);

      const logs = await prisma.auditLog.findMany({ where: { entity: 'Organization' } });
      expect(logs).toHaveLength(1);
    });
  });

  describe('GET /audit-logs', () => {
    it('solo el administrador puede consultarlos', async () => {
      const profLogin = await agent()
        .post('/api/v1/auth/login')
        .send({ email: 'prof@e2e.cl', password: PROF_PASSWORD })
        .expect(200);
      await agent().get('/api/v1/audit-logs').set('Cookie', profLogin.headers['set-cookie']).expect(403);

      const adminLogin = await loginAdmin();
      const res = await agent()
        .get('/api/v1/audit-logs')
        .set('Cookie', adminLogin.headers['set-cookie'])
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
