import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'ct_session';
const PUBLIC_PATHS = ['/login'];

/**
 * Gate liviano por presencia de sesión (ADR-06). No decodifica el JWT ni
 * valida el rol: eso lo hace la API en cada request. Su único trabajo es
 * evitar el parpadeo de páginas protegidas sin sesión y redirigir /login
 * cuando ya hay una sesión activa.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSession && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isPublicPath) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
