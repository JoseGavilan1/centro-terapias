import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../types/authenticated-user';

/** Extrae IP y user-agent del request para la auditoría. */
export const ReqContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const request = context.switchToHttp().getRequest<Request>();
    return {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
  },
);
