import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AuditAction,
  AuthUserDto,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
} from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { PASSWORD_HASHER, PasswordHasher } from '../../hashing/domain/password-hasher';
import { USER_REPOSITORY, UserRecord, UserRepository, UserWithOrganization } from '../../users/domain/user.repository';
import { RequestContext } from '../../../common/types/authenticated-user';
import { TokenService } from './token.service';

/** Hash bcrypt señuelo (sin contraseña real asociada) para comparar contra
 * cuando el email no existe, evitando un canal lateral de tiempo. */
const DUMMY_PASSWORD_HASH = '$2b$12$4n8IQoD.HrCIFdKJ8537XOeW4Rfqizkmxd4ewpK6LSkNl5qvtxw5O';

export interface LoginResult extends LoginResponse {
  refreshToken: string;
}

export interface RefreshResult extends RefreshResponse {
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginRequest, context: RequestContext): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(dto.email);

    // Mensaje, auditoría Y TIEMPO DE RESPUESTA idénticos si el email no
    // existe, la contraseña es incorrecta o la cuenta está inactiva: se
    // compara siempre contra un hash bcrypt válido (real o señuelo) para que
    // un email inexistente no responda más rápido y permita enumerar cuentas.
    const passwordMatches = await this.passwordHasher.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches || !user.isActive) {
      await this.auditService.log({
        organizationId: user?.organizationId ?? null,
        userId: user?.id ?? null,
        userEmail: dto.email,
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        entityId: user?.id ?? null,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const { accessToken, refreshToken, accessTokenExpiresIn } = await this.tokenService.issueTokens(
      user,
      context.ip,
      context.userAgent,
    );

    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      user: this.toAuthUserDto(user),
      accessToken,
      refreshToken,
      expiresIn: accessTokenExpiresIn,
    };
  }

  /**
   * Rota el refresh token. Si el token recibido ya fue rotado previamente
   * (reuso), se interpreta como robo/replay: se revocan TODAS las sesiones
   * del usuario y se audita (ADR-05).
   */
  async refresh(rawToken: string, context: RequestContext): Promise<RefreshResult> {
    const record = await this.tokenService.findValidRefreshToken(rawToken);
    if (!record) {
      throw new UnauthorizedException('Sesión inválida');
    }

    if (record.revokedAt) {
      const revokedCount = await this.tokenService.revokeAllSessionsForUser(record.userId);
      const owner = await this.userRepository.findByIdAny(record.userId);
      await this.auditService.log({
        organizationId: owner?.organizationId ?? null,
        userId: record.userId,
        userEmail: owner?.email ?? null,
        action: AuditAction.TOKEN_REUSE_DETECTED,
        entity: 'RefreshToken',
        entityId: record.id,
        newValue: { sessionsRevoked: revokedCount },
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('Sesión inválida');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sesión expirada');
    }

    const user = await this.userRepository.findByIdAny(record.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const newRefreshToken = await this.tokenService.rotateRefreshToken(
      record.id,
      user.id,
      context.ip,
      context.userAgent,
    );
    if (!newRefreshToken) {
      // Otra request concurrente rotó este mismo token primero (carrera
      // real, no reuso de un token ya viejo): no hay nada que auditar como
      // ataque, simplemente esta request perdió y debe reintentar el login.
      throw new UnauthorizedException('Sesión inválida');
    }

    const { accessToken, accessTokenExpiresIn } = await this.tokenService.signAccessToken(user);

    await this.auditService.log({
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      action: AuditAction.TOKEN_REFRESH,
      entity: 'RefreshToken',
      entityId: record.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: accessTokenExpiresIn,
    };
  }

  async logout(rawToken: string | undefined, userId: string | null, context: RequestContext): Promise<void> {
    if (!rawToken) {
      return;
    }
    const record = await this.tokenService.findValidRefreshToken(rawToken);
    if (record && !record.revokedAt) {
      await this.tokenService.revokeRefreshTokenById(record.id);
      const owner = await this.userRepository.findByIdAny(record.userId);
      await this.auditService.log({
        organizationId: owner?.organizationId ?? null,
        userId: userId ?? record.userId,
        userEmail: owner?.email ?? null,
        action: AuditAction.LOGOUT,
        entity: 'RefreshToken',
        entityId: record.id,
        ip: context.ip,
        userAgent: context.userAgent,
      });
    }
  }

  async changePassword(
    userId: string,
    organizationId: string,
    dto: ChangePasswordRequest,
    context: RequestContext,
    currentRefreshToken?: string,
  ): Promise<void> {
    const user = await this.userRepository.findById(organizationId, userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const matches = await this.passwordHasher.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    const newHash = await this.passwordHasher.hash(dto.newPassword);
    const updated = await this.userRepository.update(organizationId, userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });

    // Solo se cierran las OTRAS sesiones: la que hace este cambio sigue viva.
    const currentSession = currentRefreshToken
      ? await this.tokenService.findValidRefreshToken(currentRefreshToken)
      : null;
    await this.tokenService.revokeAllSessionsForUser(userId, currentSession?.id);

    await this.auditService.log({
      organizationId,
      userId,
      userEmail: user.email,
      action: AuditAction.PASSWORD_CHANGE,
      entity: 'User',
      entityId: userId,
      oldValue: this.toAuditSnapshot(user),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private toAuditSnapshot(user: UserRecord): Record<string, unknown> {
    const { passwordHash, ...rest } = user;
    void passwordHash;
    return rest;
  }

  async me(organizationId: string, userId: string): Promise<AuthUserDto> {
    const user = await this.userRepository.findByIdWithOrganization(organizationId, userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toAuthUserDto(user);
  }

  private toAuthUserDto(user: UserWithOrganization): AuthUserDto {
    return {
      id: user.id,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      specialty: user.specialty,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
