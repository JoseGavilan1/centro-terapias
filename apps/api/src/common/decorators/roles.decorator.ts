import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@centro/shared';

export const ROLES_KEY = 'roles';

/** Restringe un endpoint a los roles indicados (evaluado por RolesGuard). */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
