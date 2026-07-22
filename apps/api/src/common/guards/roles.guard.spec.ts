import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@centro/shared';
import { RequestWithUser } from '../types/authenticated-user';
import { RolesGuard } from './roles.guard';

function makeContext(user?: RequestWithUser['user']): ExecutionContext {
  const request: Partial<RequestWithUser> = { user };
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('permite el acceso si el endpoint no declara @Roles', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('deniega si no hay usuario autenticado pero se exige un rol', () => {
    const reflector = { getAllAndOverride: () => [UserRole.ADMIN] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('deniega si el rol del usuario no está permitido', () => {
    const reflector = { getAllAndOverride: () => [UserRole.ADMIN] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = makeContext({
      userId: 'u1',
      organizationId: 'org-1',
      email: 'p@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: null,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('permite si el rol del usuario está en la lista requerida', () => {
    const reflector = { getAllAndOverride: () => [UserRole.ADMIN] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = makeContext({
      userId: 'u1',
      organizationId: 'org-1',
      email: 'a@demo.cl',
      role: UserRole.ADMIN,
      specialty: null,
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
