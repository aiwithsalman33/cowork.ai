import { NextResponse, type NextRequest } from 'next/server';

const APP_PREFIXES = [
  '/dashboard',
  '/conversations',
  '/appointments',
  '/knowledge',
  '/learning',
  '/integrations',
  '/schedules',
  '/logs',
  '/docs',
  '/billing',
  '/agent',
  '/admin',
];

/**
 * Cheap edge guard: if there is no session cookie at all, send the user to /login.
 * Real authorization happens in the API on every request.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has('pa_at') || req.cookies.has('pa_csrf');
  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === '/login' || pathname === '/signup') && req.cookies.has('pa_at')) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|.*\\..*).*)'],
};
