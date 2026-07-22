import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Specialty, UserRole } from '@centro/shared';
import { PasswordHasher } from '../../hashing/domain/password-hasher';
import {
  CreateRefreshTokenData,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../../sessions/domain/refresh-token.repository';
import {
  UpdateUserData,
  UserRecord,
  UserRepository,
  UserWithOrganization,
} from '../../users/domain/user.repository';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

const ORG_ID = 'org-1';
const context = { ip: '127.0.0.1', userAgent: 'jest' };

function makeUser(overrides: Partial<UserWithOrganization> = {}): UserWithOrganization {
  return {
    id: 'user-1',
    organizationId: ORG_ID,
    organizationName: 'Centro Demo',
    email: 'ana@demo.cl',
    passwordHash: 'correct-hash',
    firstName: 'Ana',
    lastName: 'Pérez',
    role: UserRole.PROFESSIONAL,
    specialty: Specialty.PSICOLOGIA,
    phone: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeUserRepository implements UserRepository {
  byEmail = new Map<string, UserWithOrganization>();
  byId = new Map<string, UserWithOrganization>();

  register(user: UserWithOrganization): void {
    this.byEmail.set(user.email, user);
    this.byId.set(user.id, user);
  }

  findByEmail(email: string): Promise<UserWithOrganization | null> {
    return Promise.resolve(this.byEmail.get(email) ?? null);
  }
  findByIdAny(id: string): Promise<UserWithOrganization | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  emailExists(): Promise<boolean> {
    return Promise.resolve(false);
  }
  findById(organizationId: string, id: string): Promise<UserRecord | null> {
    const user = this.byId.get(id);
    return Promise.resolve(user && user.organizationId === organizationId ? user : null);
  }
  findByIdWithOrganization(organizationId: string, id: string): Promise<UserWithOrganization | null> {
    const user = this.byId.get(id);
    return Promise.resolve(user && user.organizationId === organizationId ? user : null);
  }
  findMany(): Promise<{ data: UserRecord[]; total: number }> {
    throw new Error('not used');
  }
  create(): Promise<UserRecord> {
    throw new Error('not used');
  }
  update(organizationId: string, id: string, data: UpdateUserData): Promise<UserRecord> {
    const user = this.byId.get(id);
    if (!user || user.organizationId !== organizationId) {
      throw new Error('not found');
    }
    const updated = { ...user, ...data, updatedAt: new Date() };
    this.byId.set(id, updated);
    this.byEmail.set(updated.email, updated);
    return Promise.resolve(updated);
  }
}

class FakeRefreshTokenRepository implements RefreshTokenRepository {
  records = new Map<string, RefreshTokenRecord>();
  private seq = 0;

  create(data: CreateRefreshTokenData): Promise<RefreshTokenRecord> {
    this.seq += 1;
    const record: RefreshTokenRecord = {
      id: `token-${this.seq}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      revokedAt: null,
      replacedById: null,
      createdByIp: data.createdByIp,
      userAgent: data.userAgent,
      createdAt: new Date(),
    };
    this.records.set(record.id, record);
    return Promise.resolve(record);
  }
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    for (const record of this.records.values()) {
      if (record.tokenHash === tokenHash) {
        return Promise.resolve(record);
      }
    }
    return Promise.resolve(null);
  }
  revoke(id: string, replacedById: string | null = null): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.revokedAt) {
      return Promise.resolve(false);
    }
    record.revokedAt = new Date();
    record.replacedById = replacedById;
    return Promise.resolve(true);
  }
  revokeAllForUser(userId: string, exceptTokenId?: string): Promise<number> {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.userId === userId && !record.revokedAt && record.id !== exceptTokenId) {
        record.revokedAt = new Date();
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

class FakePasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hash:${plain}`);
  }
  compare(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === 'correct-hash' ? plain === 'correct-password' : hash === `hash:${plain}`);
  }
}

class FakeAuditService {
  entries: Array<{ action: string; organizationId: string | null }> = [];
  log(entry: { action: string; organizationId: string | null }): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function buildAuthService() {
  const userRepository = new FakeUserRepository();
  const refreshTokenRepository = new FakeRefreshTokenRepository();
  const passwordHasher = new FakePasswordHasher();
  const auditService = new FakeAuditService();
  const configService = new ConfigService({
    auth: { accessSecret: 'test-secret-0123456789012345678901234567', accessTtl: 900, refreshTtlDays: 7 },
  });
  const tokenService = new TokenService(new JwtService(), configService, refreshTokenRepository);
  const authService = new AuthService(
    userRepository,
    passwordHasher,
    tokenService,
    auditService as unknown as import('../../audit/application/audit.service').AuditService,
  );
  return { authService, userRepository, refreshTokenRepository, auditService, tokenService };
}

describe('AuthService', () => {
  describe('login', () => {
    it('lanza 401 genérico si el email no existe y audita LOGIN_FAILED', async () => {
      const { authService, auditService } = buildAuthService();
      await expect(
        authService.login({ email: 'no-existe@demo.cl', password: 'x' }, context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditService.entries[0].action).toBe('LOGIN_FAILED');
      expect(auditService.entries[0].organizationId).toBeNull();
    });

    it('lanza 401 genérico si la contraseña es incorrecta', async () => {
      const { authService, userRepository } = buildAuthService();
      userRepository.register(makeUser());
      await expect(
        authService.login({ email: 'ana@demo.cl', password: 'incorrecta' }, context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lanza 401 genérico si la cuenta está inactiva, aunque la contraseña sea correcta', async () => {
      const { authService, userRepository } = buildAuthService();
      userRepository.register(makeUser({ isActive: false }));
      await expect(
        authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('inicia sesión, emite tokens y audita LOGIN', async () => {
      const { authService, userRepository, auditService } = buildAuthService();
      userRepository.register(makeUser());
      const result = await authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('ana@demo.cl');
      expect(auditService.entries.some((e) => e.action === 'LOGIN')).toBe(true);
    });
  });

  describe('refresh', () => {
    it('rota el token y emite un access token nuevo', async () => {
      const { authService, userRepository } = buildAuthService();
      userRepository.register(makeUser());
      const login = await authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context);
      const rotated = await authService.refresh(login.refreshToken, context);
      expect(rotated.refreshToken).not.toBe(login.refreshToken);
      expect(rotated.accessToken).toBeTruthy();
    });

    it('detecta reuso de un refresh ya rotado y revoca todas las sesiones', async () => {
      const { authService, userRepository, refreshTokenRepository, auditService } = buildAuthService();
      userRepository.register(makeUser());
      const login = await authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context);
      await authService.refresh(login.refreshToken, context);

      // Reintentar el token viejo, ya rotado ⇒ reuso.
      await expect(authService.refresh(login.refreshToken, context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auditService.entries.some((e) => e.action === 'TOKEN_REUSE_DETECTED')).toBe(true);

      const stillValid = [...refreshTokenRepository.records.values()].some(
        (r) => r.userId === 'user-1' && !r.revokedAt,
      );
      expect(stillValid).toBe(false);
    });

    it('rechaza un token inexistente', async () => {
      const { authService } = buildAuthService();
      await expect(authService.refresh('token-invalido', context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('bajo dos refresh concurrentes con el mismo token, solo uno gana y no queda un token huérfano válido', async () => {
      const { authService, userRepository, refreshTokenRepository } = buildAuthService();
      userRepository.register(makeUser());
      const login = await authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context);

      const results = await Promise.allSettled([
        authService.refresh(login.refreshToken, context),
        authService.refresh(login.refreshToken, context),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

      const activeSessions = [...refreshTokenRepository.records.values()].filter(
        (r) => r.userId === 'user-1' && !r.revokedAt,
      );
      expect(activeSessions).toHaveLength(1);
    });
  });

  describe('changePassword', () => {
    it('sin refresh token actual, revoca todas las sesiones', async () => {
      const { authService, userRepository, refreshTokenRepository } = buildAuthService();
      userRepository.register(makeUser());
      await authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context);

      await authService.changePassword(
        'user-1',
        ORG_ID,
        { currentPassword: 'correct-password', newPassword: 'NuevaClave12' },
        context,
      );

      const anyActive = [...refreshTokenRepository.records.values()].some((r) => !r.revokedAt);
      expect(anyActive).toBe(false);
    });

    it('preserva la sesión actual y revoca solo las demás', async () => {
      const { authService, userRepository } = buildAuthService();
      userRepository.register(makeUser());
      const sessionA = await authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context);
      const sessionB = await authService.login({ email: 'ana@demo.cl', password: 'correct-password' }, context);

      await authService.changePassword(
        'user-1',
        ORG_ID,
        { currentPassword: 'correct-password', newPassword: 'NuevaClave12' },
        context,
        sessionA.refreshToken,
      );

      const recordA = await authService.refresh(sessionA.refreshToken, context).catch(() => null);
      expect(recordA).not.toBeNull();

      await expect(authService.refresh(sessionB.refreshToken, context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza si la contraseña actual es incorrecta', async () => {
      const { authService, userRepository } = buildAuthService();
      userRepository.register(makeUser());
      await expect(
        authService.changePassword(
          'user-1',
          ORG_ID,
          { currentPassword: 'mala', newPassword: 'NuevaClave12' },
          context,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
