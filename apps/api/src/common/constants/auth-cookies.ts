/**
 * Nombres y rutas de las cookies de autenticación (ADR-06).
 * - ct_access: JWT de acceso, path / (viaja en cada request a la API).
 * - ct_refresh: token opaco de refresco, path restringido a /api/v1/auth.
 * - ct_session: marcador httpOnly para el middleware de Next (sin valor sensible).
 */
export const ACCESS_TOKEN_COOKIE = 'ct_access';
export const REFRESH_TOKEN_COOKIE = 'ct_refresh';
export const SESSION_MARKER_COOKIE = 'ct_session';

export const REFRESH_COOKIE_PATH = '/api/v1/auth';
