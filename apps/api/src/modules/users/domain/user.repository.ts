import { Specialty, UserRole } from '@centro/shared';

export interface UserRecord {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  specialty: Specialty | null;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithOrganization extends UserRecord {
  organizationName: string;
}

export interface CreateUserData {
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  specialty: Specialty | null;
  phone: string | null;
  mustChangePassword: boolean;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  specialty?: Specialty | null;
  phone?: string | null;
  isActive?: boolean;
  passwordHash?: string;
  mustChangePassword?: boolean;
}

export interface UserFilters {
  search?: string;
  role?: UserRole;
  specialty?: Specialty;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

/**
 * Todos los métodos de lectura/escritura scoped al tenant exigen
 * `organizationId` explícito (ADR-03). Las búsquedas por email son globales
 * por diseño: el email es único a nivel plataforma y el login no conoce el tenant.
 */
export interface UserRepository {
  findByEmail(email: string): Promise<UserWithOrganization | null>;
  /**
   * Lookup global por id, sin filtro de organización. Uso exclusivo del flujo
   * de refresh token: la identidad ya fue probada por posesión del token
   * opaco (no por un JWT con organizationId), así que el tenant se lee aquí.
   */
  findByIdAny(id: string): Promise<UserWithOrganization | null>;
  emailExists(email: string): Promise<boolean>;
  findById(organizationId: string, id: string): Promise<UserRecord | null>;
  findByIdWithOrganization(organizationId: string, id: string): Promise<UserWithOrganization | null>;
  findMany(
    organizationId: string,
    filters: UserFilters,
  ): Promise<{ data: UserRecord[]; total: number }>;
  create(data: CreateUserData): Promise<UserRecord>;
  update(organizationId: string, id: string, data: UpdateUserData): Promise<UserRecord>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
