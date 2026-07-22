import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  SESSION_MARKER_COOKIE,
} from '../../../common/constants/auth-cookies';

/** Centraliza las cookies de sesión (ADR-06) para no duplicar sus flags entre endpoints. */
export class AuthCookieHelper {
  constructor(
    private readonly response: Response,
    private readonly configService: ConfigService,
  ) {}

  setSessionCookies(accessToken: string, refreshToken: string, accessTtlSeconds: number): void {
    const secure = this.configService.getOrThrow<boolean>('auth.cookieSecure');
    const refreshTtlDays = this.configService.getOrThrow<number>('auth.refreshTtlDays');

    this.response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: accessTtlSeconds * 1000,
    });
    this.response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
    });
    this.response.cookie(SESSION_MARKER_COOKIE, '1', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshTtlDays * 24 * 60 * 60 * 1000,
    });
  }

  clearSessionCookies(): void {
    this.response.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    this.response.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_COOKIE_PATH });
    this.response.clearCookie(SESSION_MARKER_COOKIE, { path: '/' });
  }
}
