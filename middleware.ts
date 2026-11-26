import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionData } from '@/lib/session';

// Pages were reachable without login (only the APIs checked auth) — redirect to /login instead.
const PUBLIC_PATHS = ['/login', '/share'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET || 'fallback-secret-change-this-in-production-32ch',
    cookieName: 'tcp_session',
  });
  if (!session.isLoggedIn) {
    // Behind a reverse proxy nextUrl contains the internal host (localhost:4567) — use the public one
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
    const proto = (request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')).split(',')[0].trim();
    const search = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(`${proto}://${host}/login${search}`);
  }
  return response;
}

export const config = {
  // Pages only — API routes do their own auth and return JSON 401s
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
