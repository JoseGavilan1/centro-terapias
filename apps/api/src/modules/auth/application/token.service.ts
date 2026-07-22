import { randomBytes, createHash } from 'crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenPayload } from '../../../common/types/authenticated-user';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from '../../sessions/domain/refresh-token.repository';
import { UserWithOrganization } from '../../users/domain/user.repository';

const REFRESH_TOKEN_BYTES = 64;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

/**
 * Emisión y verificación de tokens (ADR-05).
 * El access token es un JWT firmado; el refresh token es un valor opaco
 * aleatorio cuyo hash SHA-256 se persiste — el valor en claro nunca se guarda.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async issueTokens(
    user: UserWithOrganization,
    ip: string | null,
    userAgent: string | null,
  ): Promise<IssuedTokens> {
    const { accessToken, accessTokenExpiresIn } = await this.signAccessToken(user);
    const { rawToken } = await this.createRefreshToken(user.id, ip, userAgent);

    return { accessToken, refreshToken: rawToken, accessTokenExpiresIn };
  }

  /**
   * Verifica un access token (firma + expiración + tipo). Único punto de
   * verificación del JWT: JwtAuthGuard delega aquí en vez de duplicar la
   * clave de configuración 'auth.accessSecret' (ver signAccessToken).
   */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('auth.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return payload;
  }

  /** Firma un access token nuevo sin tocar sesiones (usado tras rotar el refresh). */
  async signAccessToken(
    user: UserWithOrganization,
  ): Promise<{ accessToken: string; accessTokenExpiresIn: number }> {
    const accessTtl = this.configService.getOrThrow<number>('auth.accessTtl');
    const payload: AccessTokenPayload = {
      sub: user.id,
      org: user.organizationId,
      email: user.email,
      role: user.role,
      specialty: user.specialty,
      type: 'access',
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('auth.accessSecret'),
      expiresIn: accessTtl,
    });
    return { accessToken, accessTokenExpiresIn: accessTtl };
  }

  /**
   * Rota un refresh token: revoca el actual y emite uno nuevo enlazado
   * (`replacedById`), formando la cadena que permite detectar reuso.
   * Devuelve `null` si esta llamada perdió la carrera contra otra rotación
   * concurrente del MISMO token (revoke() atómico devolvió false): en ese
   * caso se descarta el token recién creado en vez de dejarlo huérfano y
   * válido, y el caller debe tratarlo como sesión inválida.
   */
  async rotateRefreshToken(
    currentTokenId: string,
    userId: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<string | null> {
    const { rawToken, id } = await this.createRefreshToken(userId, ip, userAgent);
    const revoked = await this.refreshTokenRepository.revoke(currentTokenId, id);
    if (!revoked) {
      await this.refreshTokenRepository.revoke(id);
      return null;
    }
    return rawToken;
  }

  async findValidRefreshToken(rawToken: string) {
    const record = await this.refreshTokenRepository.findByHash(this.hashToken(rawToken));
    return record;
  }

  revokeAllSessionsForUser(userId: string, exceptTokenId?: string): Promise<number> {
    return this.refreshTokenRepository.revokeAllForUser(userId, exceptTokenId);
  }

  async revokeRefreshTokenById(id: string): Promise<void> {
    await this.refreshTokenRepository.revoke(id);
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private async createRefreshToken(
    userId: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ rawToken: string; id: string }> {
    const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const ttlDays = this.configService.getOrThrow<number>('auth.refreshTtlDays');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const created = await this.refreshTokenRepository.create({
      userId,
      tokenHash: this.hashToken(rawToken),
      expiresAt,
      createdByIp: ip,
      userAgent,
    });

    return { rawToken, id: created.id };
  }
}
