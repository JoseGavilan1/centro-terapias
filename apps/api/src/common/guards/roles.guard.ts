import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@centro/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithUser } from '../types/authenticated-user';

/**
 * Guard global de autorización por rol. Se ejecuta después de JwtAuthGuard.
 * Endpoints sin @Roles() quedan accesibles para cualquier usuario autenticado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      // Endpoint @Public con @Roles: combinación inválida; se niega por seguridad.
      throw new ForbiddenException('Acceso denegado');
    }
    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }
    return true;
  }
}
