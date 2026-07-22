import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CreateUserRequest,
  DEFAULT_PAGE_SIZE,
  Paginated,
  paginate,
  ResetPasswordRequest,
  Specialty,
  UpdateUserRequest,
  UserDto,
  UserRole,
  UsersQuery,
} from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { PASSWORD_HASHER, PasswordHasher } from '../../hashing/domain/password-hasher';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from '../../sessions/domain/refresh-token.repository';
import { USER_REPOSITORY, UserRecord, UserRepository } from '../domain/user.repository';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly auditService: AuditService,
  ) {}

  async findMany(organizationId: string, query: UsersQuery): Promise<Paginated<UserDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.userRepository.findMany(organizationId, {
      search: query.search,
      role: query.role,
      specialty: query.specialty,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
      page,
      pageSize,
    });
    return paginate(data.map((user) => this.toDto(user)), total, { page, pageSize });
  }

  async findOne(organizationId: string, id: string): Promise<UserDto> {
    const user = await this.userRepository.findById(organizationId, id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return this.toDto(user);
  }

  async create(
    organizationId: string,
    dto: CreateUserRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<UserDto> {
    this.assertRoleSpecialtyInvariant(dto.role, dto.specialty ?? null);

    if (await this.userRepository.emailExists(dto.email)) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const passwordHash = await this.passwordHasher.hash(dto.temporaryPassword);
    const created = await this.userRepository.create({
      organizationId,
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      specialty: dto.role === UserRole.PROFESSIONAL ? dto.specialty ?? null : null,
      phone: dto.phone ?? null,
      mustChangePassword: true,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(created);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateUserRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<UserDto> {
    const existing = await this.userRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isSelf = existing.id === actor.userId;
    if (isSelf && dto.role !== undefined && dto.role !== existing.role) {
      throw new ConflictException('No puede cambiar su propio rol');
    }
    if (isSelf && dto.isActive === false) {
      throw new ConflictException('No puede desactivarse a sí mismo');
    }

    const nextRole = dto.role ?? existing.role;
    // nextSpecialty ya refleja lo que realmente se persistirá: si el rol deja
    // de ser PROFESSIONAL, la especialidad se anula aunque el caller no la
    // haya enviado explícitamente (evita rechazar un PATCH {role:'ADMIN'}
    // legítimo contra el specialty previo del usuario).
    const nextSpecialty =
      nextRole === UserRole.PROFESSIONAL
        ? (dto.specialty !== undefined ? dto.specialty : existing.specialty)
        : null;
    this.assertRoleSpecialtyInvariant(nextRole, nextSpecialty);

    const updated = await this.userRepository.update(organizationId, id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      specialty: dto.role !== undefined || dto.specialty !== undefined ? nextSpecialty : undefined,
      phone: dto.phone,
      isActive: dto.isActive,
    });

    const wasDeactivated = dto.isActive === false && existing.isActive;
    if (wasDeactivated) {
      await this.refreshTokenRepository.revokeAllForUser(updated.id);
    }

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: updated.id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /** No hay borrado físico de usuarios: "eliminar" = desactivar (ver docs/02-modelo-datos.md §5). */
  async deactivate(
    organizationId: string,
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    if (id === actor.userId) {
      throw new ConflictException('No puede desactivarse a sí mismo');
    }
    const existing = await this.userRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (!existing.isActive) {
      return;
    }

    const updated = await this.userRepository.update(organizationId, id, { isActive: false });
    await this.refreshTokenRepository.revokeAllForUser(id);

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.DELETE,
      entity: 'User',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  async resetPassword(
    organizationId: string,
    id: string,
    dto: ResetPasswordRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    // Resetear la propia contraseña por esta vía revocaría también la sesión
    // actual sin avisar; para eso existe /auth/change-password, que preserva
    // la sesión que hace el cambio.
    if (id === actor.userId) {
      throw new ConflictException('Use el cambio de contraseña de su perfil para su propia cuenta');
    }

    const existing = await this.userRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const passwordHash = await this.passwordHasher.hash(dto.temporaryPassword);
    const updated = await this.userRepository.update(organizationId, id, {
      passwordHash,
      mustChangePassword: true,
    });
    await this.refreshTokenRepository.revokeAllForUser(id);

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.PASSWORD_RESET,
      entity: 'User',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /**
   * Especialidad obligatoria si y solo si el rol es PROFESSIONAL (ADR-04).
   * ADMIN nunca lleva especialidad: la confidencialidad psicológica se deriva
   * de specialty=PSICOLOGIA en un PROFESSIONAL, nunca de un rol administrativo.
   */
  private assertRoleSpecialtyInvariant(role: UserRole, specialty: Specialty | null): void {
    if (role === UserRole.PROFESSIONAL && !specialty) {
      throw new BadRequestException('La especialidad es obligatoria para un profesional');
    }
    if (role === UserRole.ADMIN && specialty) {
      throw new BadRequestException('Un administrador no debe tener especialidad clínica');
    }
  }

  private toAuditSnapshot(user: UserRecord): Record<string, unknown> {
    const { passwordHash, ...rest } = user;
    void passwordHash;
    return rest;
  }

  private toDto(user: UserRecord): UserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      specialty: user.specialty,
      phone: user.phone,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
