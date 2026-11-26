import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export interface SessionData {
  isLoggedIn: boolean;
  username?: string;
  activeAccountId?: number; // currently selected account
}

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[security] SESSION_SECRET is not set — using an insecure fallback. Set it in .env (openssl rand -hex 32).');
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'fallback-secret-change-this-in-production-32ch',
  cookieName: 'tcp_session',
  cookieOptions: {
    httpOnly: true,
    // The panel is usually opened as http://SERVER_IP:4567. A `secure` cookie is silently dropped by
    // browsers on plain HTTP, which made login impossible in production. Enable only behind HTTPS.
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth(_request?: NextRequest): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Returns the active account ID from the session (or ?accountId=), or an error response */
export async function requireAccount(request: NextRequest): Promise<{ accountId: number } | NextResponse> {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const qAccountId = new URL(request.url).searchParams.get('accountId');
  const accountId = qAccountId ? parseInt(qAccountId, 10) : session.activeAccountId;
  if (!accountId || Number.isNaN(accountId)) {
    return NextResponse.json(
      { success: false, code: 'NO_ACCOUNT', error: 'No active account selected. Go to Accounts to add or select one.' },
      { status: 400 },
    );
  }
  return { accountId };
}

/** Parse a YYYY-MM-DD (or ISO) "to" date as the END of that day, so the chosen day is included. */
export function parseDateTo(v?: string | null): Date | undefined {
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T23:59:59.999`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseDateFrom(v?: string | null): Date | undefined {
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00.000`);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function clientIp(request: NextRequest): string {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}
