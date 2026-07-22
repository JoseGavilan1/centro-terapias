import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@centro/shared';
import { TokenService } from '../../modules/auth/application/token.service';
import { RefreshTokenRepository } from '../../modules/sessions/domain/refresh-token.repository';
import { AccessTokenPayload, RequestWithUser } from '../types/authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'test-secret-0123456789012345678901234567';

function makeContext(request: Partial<RequestWithUser>): ExecutionContext {
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService();
  const configService = new ConfigService({ auth: { accessSecret: SECRET } });
  // verifyAccessToken no usa el repositorio de refresh tokens; no hace falta un fake real.
  const tokenService = new TokenService(jwtService, configService, {} as RefreshTokenRepository);

  function makeGuard(isPublic: boolean | undefined): JwtAuthGuard {
    const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
    return new JwtAuthGuard(tokenService, reflector);
  }

  it('permite endpoints marcados @Public sin token', async () => {
    const guard = makeGuard(true);
    const context = makeContext({ headers: {}, cookies: {} });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rechaza si no hay token en cookie ni en Authorization', async () => {
    const guard = makeGuard(false);
    const context = makeContext({ headers: {}, cookies: {} });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token inválido', async () => {
    const guard = makeGuard(false);
    const context = makeContext({ headers: { authorization: 'Bearer token-invalido' }, cookies: {} });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('acepta un token válido por cookie y puebla request.user', async () => {
    const payload: AccessTokenPayload = {
      sub: 'user-1',
      org: 'org-1',
      email: 'a@demo.cl',
      role: UserRole.ADMIN,
      specialty: null,
      type: 'access',
    };
    const token = await jwtService.signAsync(payload, { secret: SECRET, expiresIn: 900 });
    const guard = makeGuard(false);
    const request: Partial<RequestWithUser> = { headers: {}, cookies: { ct_access: token } };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.userId).toBe('user-1');
    expect(request.user?.organizationId).toBe('org-1');
  });

  it('acepta un token válido por Authorization: Bearer', async () => {
    const payload: AccessTokenPayload = {
      sub: 'user-2',
      org: 'org-1',
      email: 'p@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: null,
      type: 'access',
    };
    const token = await jwtService.signAsync(payload, { secret: SECRET, expiresIn: 900 });
    const guard = makeGuard(false);
    const request: Partial<RequestWithUser> = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.userId).toBe('user-2');
  });
});
