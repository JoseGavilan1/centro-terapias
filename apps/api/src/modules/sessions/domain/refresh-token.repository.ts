export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdByIp: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdByIp: string | null;
  userAgent: string | null;
}

/**
 * Persistencia de sesiones (refresh tokens opacos, ADR-05).
 * Módulo propio para que tanto `auth` (emisión/rotación) como `users`
 * (revocación al desactivar o resetear contraseña) dependan de él sin ciclos.
 */
export interface RefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Revoca condicionalmente (solo si aún no estaba revocado) en una única
   * operación atómica. Devuelve `true` si esta llamada fue la que lo revocó;
   * `false` si ya estaba revocado (p. ej. una rotación concurrente ganó la
   * carrera) — el caller debe tratar `false` como reuso, no como éxito.
   */
  revoke(id: string, replacedById?: string | null): Promise<boolean>;
  /**
   * Revoca todas las sesiones activas del usuario. Devuelve cuántas revocó.
   * `exceptTokenId` preserva la sesión actual (p. ej. al cambiar la propia
   * contraseña, que solo debe cerrar las OTRAS sesiones).
   */
  revokeAllForUser(userId: string, exceptTokenId?: string): Promise<number>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
