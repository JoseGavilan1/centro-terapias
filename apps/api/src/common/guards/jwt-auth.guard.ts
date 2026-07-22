import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../../modules/auth/application/token.service';
import { ACCESS_TOKEN_COOKIE } from '../constants/auth-cookies';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestWithUser } from '../types/authenticated-user';

/**
 * Guard global de autenticación (deny-by-default).
 * Acepta el access token desde la cookie httpOnly `ct_access` o desde
 * `Authorization: Bearer` (clientes de API / Swagger). La verificación en sí
 * vive en TokenService (único punto que conoce el secreto de firma).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('No autenticado');
    }

    const payload = await this.tokenService.verifyAccessToken(token);

    request.user = {
      userId: payload.sub,
      organizationId: payload.org,
      email: payload.email,
      role: payload.role,
      specialty: payload.specialty,
    };
    return true;
  }

  private extractToken(request: RequestWithUser): string | null {
    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieToken = cookies?.[ACCESS_TOKEN_COOKIE];
    if (cookieToken) {
      return cookieToken;
    }
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return null;
  }
}
