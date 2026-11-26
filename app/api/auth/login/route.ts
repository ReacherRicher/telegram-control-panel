import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { getSession, clientIp } from '@/lib/session';
import { createLog } from '@/server/services/log';

// Simple in-memory brute-force protection: 8 failures per IP per 15 minutes
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const g = globalThis as unknown as { __loginFails?: Map<string, { count: number; first: number }> };
const fails = (g.__loginFails ??= new Map());

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rec = fails.get(ip);
  if (rec && Date.now() - rec.first < WINDOW_MS && rec.count >= MAX_FAILS) {
    const mins = Math.ceil((WINDOW_MS - (Date.now() - rec.first)) / 60000);
    return NextResponse.json({ success: false, error: `Too many failed attempts. Try again in ${mins} min.` }, { status: 429 });
  }

  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ success: false, error: 'Username and password required' }, { status: 400 });
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    return NextResponse.json({ success: false, error: 'ADMIN_PASSWORD is not set in .env' }, { status: 500 });
  }

  const usernameMatch = safeEqual(String(username), adminUsername);
  // Supports a bcrypt hash ($2…) or plain text
  const passwordMatch = adminPassword.startsWith('$2')
    ? await bcrypt.compare(String(password), adminPassword)
    : safeEqual(String(password), adminPassword);

  if (!usernameMatch || !passwordMatch) {
    const r = rec && Date.now() - rec.first < WINDOW_MS ? rec : { count: 0, first: Date.now() };
    r.count++;
    fails.set(ip, r);
    await createLog({ action: 'LOGIN', details: `Failed login attempt for user: ${String(username).slice(0, 64)}`, ipAddress: ip });
    return NextResponse.json({ success: false, error: 'Invalid username or password' }, { status: 401 });
  }

  fails.delete(ip);
  const session = await getSession();
  session.isLoggedIn = true;
  session.username = username;
  await session.save();

  await createLog({ action: 'LOGIN', details: `Admin logged in: ${username}`, ipAddress: ip });
  return NextResponse.json({ success: true });
}
