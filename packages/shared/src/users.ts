import type { Specialty, UserRole } from './enums';
import type { PageQuery } from './pagination';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  specialty: Specialty | null;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** Obligatoria cuando role = PROFESSIONAL; debe omitirse para ADMIN. */
  specialty?: Specialty;
  phone?: string;
  /** Contraseña temporal; el usuario deberá cambiarla al ingresar. */
  temporaryPassword: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  specialty?: Specialty | null;
  phone?: string | null;
  isActive?: boolean;
}

export interface ResetPasswordRequest {
  temporaryPassword: string;
}

export interface UsersQuery extends PageQuery {
  search?: string;
  role?: UserRole;
  specialty?: Specialty;
  /** 'true' | 'false' — llega como string por query param. */
  isActive?: string;
}
