/**
 * Web-based Telegram login flow (phone → code → [2FA])
 *
 * POST { step: 'phone', slug, label, phone }  → { nextStep: 'code', codeViaApp }
 * POST { step: 'code',  slug, code }          → { nextStep: '2fa', hint } | { nextStep: 'done', account }
 * POST { step: '2fa',   slug, password }      → { nextStep: 'done', account }
 * POST { step: 'cancel', slug }
 *
 * A wrong code / password can be retried without starting over (previously any error killed the
 * login, and an invalid phone number made GramJS re-send the code request in an endless loop).
 */
import { NextRequest, NextResponse } from 'next/server';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { requireAuth, getSession } from '@/lib/session';
import prisma from '@/lib/prisma';
import { saveSession, sessionFilePath, disconnectAccount } from '@/server/telegram/client';
import { createLog } from '@/server/services/log';

type Stage = 'phone' | 'code' | 'password' | 'done' | 'failed';

interface PendingLogin {
  client: TelegramClient;
  phone: string;
  label: string;
  stage: Stage;
  waitingFor: 'code' | 'password' | null;
  resolveInput: ((v: string) => void) | null;
  lastError: string | null;
  codeViaApp?: boolean;
  hint?: string;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __pendingLogins?: Map<string, PendingLogin> };
const pendingLogins = (g.__pendingLogins ??= new Map<string, PendingLogin>());

function friendly(err: string): string {
  if (/PHONE_NUMBER_INVALID/.test(err)) return 'Invalid phone number. Use international format, e.g. +1555…';
  if (/PHONE_NUMBER_BANNED/.test(err)) return 'This phone number is banned by Telegram.';
  if (/PHONE_NUMBER_FLOOD|FLOOD/.test(err)) return 'Too many attempts for this number. Telegram asks to wait before trying again.';
  if (/PHONE_CODE_INVALID/.test(err)) return 'Wrong code. Check the code and try again.';
  if (/PHONE_CODE_EXPIRED/.test(err)) return 'The code expired. Start again to get a new code.';
  if (/PASSWORD_HASH_INVALID/.test(err)) return 'Wrong 2FA password. Try again.';
  if (/API_ID_INVALID/.test(err)) return 'TELEGRAM_API_ID / TELEGRAM_API_HASH in .env are invalid.';
  return err;
}

async function dispose(slug: string) {
  const p = pendingLogins.get(slug);
  pendingLogins.delete(slug);
  if (p) { try { await p.client.disconnect(); } catch { /* ignore */ } }
}

async function cleanupExpired() {
  for (const [slug, p] of pendingLogins) {
    if (Date.now() - p.createdAt > TTL_MS) await dispose(slug);
  }
}

/** Wait until the login reaches a new state (or timeout). */
async function waitForChange(p: PendingLogin, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (p.stage === 'done' || p.stage === 'failed' || p.waitingFor) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

function getApiCredentials() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  if (!apiId || !apiHash) throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env');
  return { apiId, apiHash };
}

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  await cleanupExpired();

  const body = await request.json().catch(() => ({}));
  const step = String(body.step || '');
  const slug = String(body.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{2,32}$/.test(slug)) return fail('Slug must be 2–32 chars: lowercase letters, numbers, underscore');

  if (step === 'cancel') {
    await dispose(slug);
    return NextResponse.json({ success: true });
  }

  // ── STEP 1: phone ──────────────────────────────────────────────────────────
  if (step === 'phone') {
    const phone = String(body.phone || '').replace(/[\s()-]/g, '');
    const label = String(body.label || '').trim();
    if (!/^\+?\d{6,16}$/.test(phone)) return fail('Enter the phone number in international format, e.g. +15551234567');
    if (!label) return fail('Display label is required');

    await dispose(slug);
    let creds;
    try { creds = getApiCredentials(); } catch (e) { return fail(String((e as Error).message), 500); }

    const client = new TelegramClient(new StringSession(''), creds.apiId, creds.apiHash, {
      connectionRetries: 3,
      appVersion: 'TelegramControlPanel/1.0',
      deviceModel: `TCP-${slug}`,
    });
    const p: PendingLogin = {
      client, phone, label, stage: 'phone', waitingFor: null, resolveInput: null, lastError: null, createdAt: Date.now(),
    };
    pendingLogins.set(slug, p);

    client.start({
      phoneNumber: async () => phone,
      phoneCode: async (isCodeViaApp?: boolean) => {
        p.stage = 'code';
        p.codeViaApp = isCodeViaApp;
        return new Promise<string>((resolve) => { p.resolveInput = resolve; p.waitingFor = 'code'; });
      },
      password: async (hint?: string) => {
        p.stage = 'password';
        p.hint = hint;
        return new Promise<string>((resolve) => { p.resolveInput = resolve; p.waitingFor = 'password'; });
      },
      onError: async (err: Error) => {
        p.lastError = friendly(err.message);
        // Errors before a code was sent, or an expired code, are fatal. Returning true stops GramJS
        // (otherwise it would call phoneNumber() again and re-send forever).
        if (p.stage === 'phone' || /PHONE_CODE_EXPIRED|AUTH_RESTART|PHONE_NUMBER/.test(err.message)) {
          p.stage = 'failed';
          return true;
        }
        return false; // wrong code / password → GramJS asks again
      },
    }).then(() => {
      p.stage = 'done';
    }).catch((err) => {
      if (p.stage !== 'failed') { p.stage = 'failed'; p.lastError = p.lastError || friendly(String(err?.message || err)); }
    });

    await waitForChange(p);
    if (p.stage === 'failed' || p.waitingFor !== 'code') {
      const msg = p.lastError || 'Telegram did not respond. Check the server internet connection and API credentials.';
      await dispose(slug);
      return fail(msg);
    }

    return NextResponse.json({ success: true, data: { nextStep: 'code', slug, codeViaApp: !!p.codeViaApp } });
  }

  const p = pendingLogins.get(slug);
  if (!p) return fail('Login session expired. Please start again.', 400, { restart: true });

  // ── STEP 2 / 3: code or 2FA password ───────────────────────────────────────
  if (step === 'code' || step === '2fa') {
    const expected = step === 'code' ? 'code' : 'password';
    const value = step === 'code' ? String(body.code || '').replace(/\D/g, '') : String(body.password || '');
    if (!value) return fail(step === 'code' ? 'Enter the code' : 'Enter the 2FA password');
    if (p.waitingFor !== expected || !p.resolveInput) {
      return fail(p.waitingFor === 'password' ? 'A 2FA password is required now.' : 'Not waiting for this input. Start again.', 409, { nextStep: p.waitingFor === 'password' ? '2fa' : undefined });
    }

    p.lastError = null;
    const resolve = p.resolveInput;
    p.resolveInput = null;
    p.waitingFor = null;
    resolve(value);

    await waitForChange(p);

    if (p.stage === 'done') return finishLogin(slug, p);
    if (p.stage === 'failed') {
      const msg = p.lastError || 'Login failed';
      await dispose(slug);
      return fail(msg, 400, { restart: true });
    }
    if (p.waitingFor === 'password' && step === 'code') {
      return NextResponse.json({ success: true, data: { nextStep: '2fa', slug, hint: p.hint || null } });
    }
    if (p.waitingFor === expected) {
      return fail(p.lastError || 'Incorrect, try again.', 400, { retry: true });
    }
    return fail('Telegram is taking too long. Try again.', 408, { retry: true });
  }

  return fail(`Unknown step: ${step}`);
}

async function finishLogin(slug: string, p: PendingLogin) {
  try {
    const me = (await p.client.getMe()) as unknown as {
      firstName?: string; lastName?: string; username?: string; id: unknown; phone?: string; premium?: boolean; verified?: boolean;
    };
    const sessionString = (p.client.session as StringSession).save();
    // Close any old pooled connection for this slug before switching to the new session
    await disconnectAccount(slug);
    saveSession(slug, sessionString);

    const data = {
      label: p.label, phone: me.phone || p.phone, isActive: true,
      telegramId: String(me.id), firstName: me.firstName, lastName: me.lastName, username: me.username,
      isPremium: !!me.premium, isVerified: !!me.verified,
    };
    const account = await prisma.account.upsert({
      where: { slug },
      update: data,
      create: { slug, sessionFile: sessionFilePath(slug), ...data },
    });

    await dispose(slug); // the pooled client will reconnect with the saved session

    // Auto-select the new account if none is selected yet
    const session = await getSession();
    if (!session.activeAccountId) { session.activeAccountId = account.id; await session.save(); }

    await createLog({ action: 'LOGIN', accountId: account.id, details: `Telegram account logged in: ${p.label} (${slug})` });

    return NextResponse.json({
      success: true,
      data: {
        nextStep: 'done',
        account: { id: account.id, slug, name: [me.firstName, me.lastName].filter(Boolean).join(' '), username: me.username, telegramId: String(me.id), phone: me.phone },
      },
    });
  } catch (err) {
    await dispose(slug);
    return fail(String((err as Error)?.message || err), 500);
  }
}
