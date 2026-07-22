import type { Specialty, UserRole } from './enums';

/**
 * Política de contraseñas única (login, creación, reset y cambio de
 * contraseña): mínimo 8 caracteres, al menos 1 mayúscula, 1 minúscula y 1
 * dígito. Fuente de verdad compartida por los DTOs de NestJS (class-validator)
 * y los esquemas zod del frontend — evita que ambos lados diverjan.
 */
export const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
export const PASSWORD_POLICY_MESSAGE = 'La contraseña debe incluir mayúscula, minúscula y un dígito';
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export interface LoginRequest {
  email: string;
  password: string;
}

/** Usuario autenticado tal como viaja en las respuestas de /auth. */
export interface AuthUserDto {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  specialty: Specialty | null;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  user: AuthUserDto;
  /** También se entrega como cookie httpOnly; se expone para clientes de API. */
  accessToken: string;
  /** Segundos de vida del access token. */
  expiresIn: number;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
