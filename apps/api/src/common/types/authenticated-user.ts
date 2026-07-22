import { Specialty, UserRole } from '@centro/shared';
import { Request } from 'express';

/**
 * Identidad autenticada que viaja en el request tras validar el access token.
 * `organizationId` es la fuente del tenant activo: TODA consulta a repositorios
 * debe filtrar por este valor (ADR-03).
 */
export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  email: string;
  role: UserRole;
  specialty: Specialty | null;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/** Payload firmado dentro del access token JWT. */
export interface AccessTokenPayload {
  sub: string;
  org: string;
  email: string;
  role: UserRole;
  specialty: Specialty | null;
  type: 'access';
}

/** Contexto de red del request, usado por la auditoría. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}
