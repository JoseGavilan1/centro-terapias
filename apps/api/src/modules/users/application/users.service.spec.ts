import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Specialty, UserRole } from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { PasswordHasher } from '../../hashing/domain/password-hasher';
import { RefreshTokenRepository } from '../../sessions/domain/refresh-token.repository';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateUserData, UpdateUserData, UserRecord, UserRepository } from '../domain/user.repository';
import { UsersService } from './users.service';

const ORG_ID = 'org-1';

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    organizationId: ORG_ID,
    email: 'user@demo.cl',
    passwordHash: 'hash',
    firstName: 'Ana',
    lastName: 'Pérez',
    role: UserRole.PROFESSIONAL,
    specialty: Specialty.KINESIOLOGIA,
    phone: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeUserRepository implements UserRepository {
  users: UserRecord[] = [];

  findByEmail() {
    return Promise.resolve(null);
  }
  findByIdAny() {
    return Promise.resolve(null);
  }
  emailExists(email: string): Promise<boolean> {
    return Promise.resolve(this.users.some((u) => u.email === email.toLowerCase()));
  }
  findById(organizationId: string, id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.find((u) => u.id === id && u.organizationId === organizationId) ?? null);
  }
  findByIdWithOrganization() {
    return Promise.resolve(null);
  }
  findMany(organizationId: string): Promise<{ data: UserRecord[]; total: number }> {
    const data = this.users.filter((u) => u.organizationId === organizationId);
    return Promise.resolve({ data, total: data.length });
  }
  create(data: CreateUserData): Promise<UserRecord> {
    const user = makeUser({ ...data, id: `user-${this.users.length + 1}` });
    this.users.push(user);
    return Promise.resolve(user);
  }
  update(organizationId: string, id: string, data: UpdateUserData): Promise<UserRecord> {
    const idx = this.users.findIndex((u) => u.id === id && u.organizationId === organizationId);
    if (idx === -1) {
      throw new NotFoundException('Usuario no encontrado');
    }
    this.users[idx] = { ...this.users[idx], ...data, updatedAt: new Date() };
    return Promise.resolve(this.users[idx]);
  }
}

class FakePasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }
  compare(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class FakeRefreshTokenRepository implements RefreshTokenRepository {
  revokedForUser: string[] = [];
  create(): Promise<never> {
    throw new Error('not used in these tests');
  }
  findByHash() {
    return Promise.resolve(null);
  }
  revoke(): Promise<boolean> {
    return Promise.resolve(true);
  }
  revokeAllForUser(userId: string): Promise<number> {
    this.revokedForUser.push(userId);
    return Promise.resolve(1);
  }
}

class FakeAuditService {
  entries: unknown[] = [];
  log(entry: unknown): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

describe('UsersService', () => {
  let repo: FakeUserRepository;
  let refreshTokens: FakeRefreshTokenRepository;
  let audit: FakeAuditService;
  let service: UsersService;
  let admin: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    repo = new FakeUserRepository();
    refreshTokens = new FakeRefreshTokenRepository();
    audit = new FakeAuditService();
    service = new UsersService(
      repo,
      new FakePasswordHasher(),
      refreshTokens,
      audit as unknown as AuditService,
    );
    admin = {
      userId: 'admin-1',
      organizationId: ORG_ID,
      email: 'admin@demo.cl',
      role: UserRole.ADMIN,
      specialty: null,
    };
  });

  describe('create', () => {
    it('rechaza un profesional sin especialidad', async () => {
      await expect(
        service.create(
          ORG_ID,
          {
            email: 'nuevo@demo.cl',
            firstName: 'N',
            lastName: 'N',
            role: UserRole.PROFESSIONAL,
            temporaryPassword: 'Abcdef12',
          },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un administrador con especialidad', async () => {
      await expect(
        service.create(
          ORG_ID,
          {
            email: 'nuevo@demo.cl',
            firstName: 'N',
            lastName: 'N',
            role: UserRole.ADMIN,
            specialty: Specialty.PSICOLOGIA,
            temporaryPassword: 'Abcdef12',
          },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un email duplicado', async () => {
      repo.users.push(makeUser({ email: 'dup@demo.cl' }));
      await expect(
        service.create(
          ORG_ID,
          {
            email: 'dup@demo.cl',
            firstName: 'N',
            lastName: 'N',
            role: UserRole.PROFESSIONAL,
            specialty: Specialty.PSICOLOGIA,
            temporaryPassword: 'Abcdef12',
          },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('crea un profesional con mustChangePassword=true y audita CREATE', async () => {
      const dto = await service.create(
        ORG_ID,
        {
          email: 'psico@demo.cl',
          firstName: 'Sofía',
          lastName: 'Ruiz',
          role: UserRole.PROFESSIONAL,
          specialty: Specialty.PSICOLOGIA,
          temporaryPassword: 'Abcdef12',
        },
        admin,
        context,
      );
      expect(dto.mustChangePassword).toBe(true);
      expect(dto.specialty).toBe(Specialty.PSICOLOGIA);
      expect(audit.entries).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('impide que un admin se cambie su propio rol', async () => {
      repo.users.push(makeUser({ id: admin.userId, organizationId: ORG_ID, role: UserRole.ADMIN, specialty: null }));
      await expect(
        service.update(ORG_ID, admin.userId, { role: UserRole.PROFESSIONAL }, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('impide que un admin se desactive a sí mismo', async () => {
      repo.users.push(makeUser({ id: admin.userId, organizationId: ORG_ID, role: UserRole.ADMIN, specialty: null }));
      await expect(
        service.update(ORG_ID, admin.userId, { isActive: false }, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('revoca sesiones al desactivar a otro usuario', async () => {
      const target = makeUser({ id: 'user-2' });
      repo.users.push(target);
      await service.update(ORG_ID, target.id, { isActive: false }, admin, context);
      expect(refreshTokens.revokedForUser).toContain(target.id);
    });

    it('lanza 404 si el usuario no existe', async () => {
      await expect(
        service.update(ORG_ID, 'inexistente', { firstName: 'X' }, admin, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('permite pasar a ADMIN sin enviar specialty, aunque el usuario ya tuviera una', async () => {
      const target = makeUser({ id: 'user-4', role: UserRole.PROFESSIONAL, specialty: Specialty.PSICOLOGIA });
      repo.users.push(target);
      const updated = await service.update(ORG_ID, target.id, { role: UserRole.ADMIN }, admin, context);
      expect(updated.role).toBe(UserRole.ADMIN);
      expect(updated.specialty).toBeNull();
    });

    it('rechaza con 400 (no 403) la violación del invariante rol/especialidad', async () => {
      const target = makeUser({ id: 'user-5', role: UserRole.PROFESSIONAL, specialty: Specialty.PSICOLOGIA });
      repo.users.push(target);
      await expect(
        service.update(ORG_ID, target.id, { specialty: null }, admin, context),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('impide auto-desactivación', async () => {
      await expect(service.deactivate(ORG_ID, admin.userId, admin, context)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('desactiva y revoca sesiones', async () => {
      const target = makeUser({ id: 'user-3' });
      repo.users.push(target);
      await service.deactivate(ORG_ID, target.id, admin, context);
      const updated = await repo.findById(ORG_ID, target.id);
      expect(updated?.isActive).toBe(false);
      expect(refreshTokens.revokedForUser).toContain(target.id);
    });
  });
});
