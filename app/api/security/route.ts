import { NextRequest, NextResponse } from 'next/server';
import { activeAccount, fail } from '@/lib/account-route';
import { clientIp } from '@/lib/session';
import { createLog } from '@/server/services/log';
import {
  listSessions, terminateSession, terminateOtherSessions, getTwoFactorStatus,
  getPrivacySettings, setPrivacy, getAccountTtl, setAccountTtl, PRIVACY_KEYS, ACCOUNT_TTL_DAYS,
  type PrivacyKey, type PrivacyLevel,
} from '@/server/telegram/security';

// GET ?section=sessions|privacy|overview (default overview = 2FA + self-destruct timer)
export async function GET(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  const section = new URL(request.url).searchParams.get('section') || 'overview';
  try {
    if (section === 'sessions') return NextResponse.json({ success: true, data: await listSessions(account.slug) });
    if (section === 'privacy') return NextResponse.json({ success: true, data: await getPrivacySettings(account.slug) });
    const [twoFactor, ttlDays] = await Promise.all([getTwoFactorStatus(account.slug), getAccountTtl(account.slug)]);
    return NextResponse.json({ success: true, data: { twoFactor, ttlDays, ttlOptions: ACCOUNT_TTL_DAYS } });
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST
 *  { action: 'terminate', hash }
 *  { action: 'terminateOthers' }
 *  { action: 'privacy', key, level }
 *  { action: 'ttl', days }
 */
export async function POST(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  const body = await request.json().catch(() => ({}));
  const ip = clientIp(request);
  try {
    switch (body.action) {
      case 'terminate': {
        const sessions = await listSessions(account.slug);
        const s = sessions.find((x) => x.hash === String(body.hash));
        if (!s) return fail('Session not found (it may already be terminated)', 404);
        if (s.current) return fail('This is the panel’s own session. Remove the account on the Accounts page instead.', 400);
        await terminateSession(account.slug, s.hash);
        await createLog({ action: 'SECURITY', accountId: account.id, details: `Terminated session: ${s.appName} on ${s.device} (${s.ip} ${s.location})`, ipAddress: ip });
        return NextResponse.json({ success: true });
      }
      case 'terminateOthers': {
        const count = (await listSessions(account.slug)).filter((s) => !s.current).length;
        await terminateOtherSessions(account.slug);
        await createLog({ action: 'SECURITY', accountId: account.id, details: `Terminated all other sessions (${count})`, ipAddress: ip });
        return NextResponse.json({ success: true, data: { terminated: count } });
      }
      case 'privacy': {
        const key = String(body.key) as PrivacyKey;
        const level = String(body.level) as PrivacyLevel;
        if (!(key in PRIVACY_KEYS)) return fail('Unknown privacy setting', 400);
        if (!['everybody', 'contacts', 'nobody'].includes(level)) return fail('level must be everybody, contacts or nobody', 400);
        await setPrivacy(account.slug, key, level);
        await createLog({ action: 'SECURITY', accountId: account.id, details: `Privacy "${PRIVACY_KEYS[key].label}" set to ${level}`, ipAddress: ip });
        return NextResponse.json({ success: true });
      }
      case 'ttl': {
        const days = parseInt(String(body.days), 10);
        await setAccountTtl(account.slug, days);
        await createLog({ action: 'SECURITY', accountId: account.id, details: `Account self-destruct set to ${days} days of inactivity`, ipAddress: ip });
        return NextResponse.json({ success: true });
      }
      default:
        return fail('Unknown action', 400);
    }
  } catch (err) {
    return fail(err, 400);
  }
}
