import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser, RequestWithUser } from '../types/authenticated-user';

/** Inyecta el usuario autenticado del request en un parámetro del controller. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      // Solo alcanzable si se usa en un endpoint @Public sin token.
      throw new UnauthorizedException();
    }
    return request.user;
  },
);
