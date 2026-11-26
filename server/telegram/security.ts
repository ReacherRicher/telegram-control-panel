/**
 * Account security: active sessions (authorizations), 2FA status, privacy rules and
 * the account self-destruct timer.
 */
import bigInt from 'big-integer';
import { Api } from 'telegram';
import { getClientForAccount } from './client';

// ── Active sessions ──────────────────────────────────────────────────────────
export interface SessionInfo {
  hash: string;
  current: boolean;
  device: string;
  platform: string;
  systemVersion: string;
  appName: string;
  appVersion: string;
  officialApp: boolean;
  ip: string;
  location: string;
  createdAt: string;
  lastActiveAt: string;
  passwordPending: boolean;
}

export async function listSessions(slug: string): Promise<SessionInfo[]> {
  const client = await getClientForAccount(slug);
  const res = await client.invoke(new Api.account.GetAuthorizations());
  return res.authorizations
    .map((a) => ({
      hash: a.hash.toString(),
      current: !!a.current,
      device: a.deviceModel || '',
      platform: a.platform || '',
      systemVersion: a.systemVersion || '',
      appName: a.appName || '',
      appVersion: a.appVersion || '',
      officialApp: !!a.officialApp,
      ip: a.ip || '',
      location: [a.region, a.country].filter(Boolean).join(', '),
      createdAt: new Date(a.dateCreated * 1000).toISOString(),
      lastActiveAt: new Date(a.dateActive * 1000).toISOString(),
      passwordPending: !!a.passwordPending,
    }))
    .sort((x, y) => Number(y.current) - Number(x.current) || y.lastActiveAt.localeCompare(x.lastActiveAt));
}

export async function terminateSession(slug: string, hash: string) {
  if (!/^-?\d+$/.test(hash) || hash === '0') throw new Error('Invalid session id');
  const client = await getClientForAccount(slug);
  await client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(hash) }));
}

/** Terminate every session except the one this panel uses. */
export async function terminateOtherSessions(slug: string) {
  const client = await getClientForAccount(slug);
  await client.invoke(new Api.auth.ResetAuthorizations());
}

// ── Two-step verification ────────────────────────────────────────────────────
export async function getTwoFactorStatus(slug: string) {
  const client = await getClientForAccount(slug);
  const p = await client.invoke(new Api.account.GetPassword());
  return {
    enabled: !!p.hasPassword,
    hint: p.hint || '',
    hasRecoveryEmail: !!p.hasRecovery,
    unconfirmedEmail: p.emailUnconfirmedPattern || '',
    loginEmail: p.loginEmailPattern || '',
  };
}

// ── Privacy ──────────────────────────────────────────────────────────────────
export type PrivacyLevel = 'everybody' | 'contacts' | 'nobody';

export const PRIVACY_KEYS = {
  lastSeen: { label: 'Last seen & online', make: () => new Api.InputPrivacyKeyStatusTimestamp() },
  phoneNumber: { label: 'Phone number', make: () => new Api.InputPrivacyKeyPhoneNumber() },
  profilePhoto: { label: 'Profile photo', make: () => new Api.InputPrivacyKeyProfilePhoto() },
  about: { label: 'Bio', make: () => new Api.InputPrivacyKeyAbout() },
  forwards: { label: 'Link in forwarded messages', make: () => new Api.InputPrivacyKeyForwards() },
  calls: { label: 'Calls', make: () => new Api.InputPrivacyKeyPhoneCall() },
  groupInvites: { label: 'Who can add me to groups', make: () => new Api.InputPrivacyKeyChatInvite() },
  voiceMessages: { label: 'Voice messages (Premium)', make: () => new Api.InputPrivacyKeyVoiceMessages() },
} as const;

export type PrivacyKey = keyof typeof PRIVACY_KEYS;

export interface PrivacySetting {
  key: PrivacyKey;
  label: string;
  level: PrivacyLevel;
  /** true when the rule has per-user / per-chat exceptions that a simple change would overwrite */
  hasExceptions: boolean;
}

function summarize(rules: Api.TypePrivacyRule[]): { level: PrivacyLevel; hasExceptions: boolean } {
  const has = (cls: unknown) => rules.some((r) => r instanceof (cls as new (...a: never[]) => unknown));
  const level: PrivacyLevel = has(Api.PrivacyValueAllowAll) ? 'everybody' : has(Api.PrivacyValueAllowContacts) ? 'contacts' : 'nobody';
  const hasExceptions = rules.some((r) =>
    r instanceof Api.PrivacyValueAllowUsers || r instanceof Api.PrivacyValueDisallowUsers ||
    r instanceof Api.PrivacyValueAllowChatParticipants || r instanceof Api.PrivacyValueDisallowChatParticipants ||
    r instanceof Api.PrivacyValueDisallowContacts || r instanceof Api.PrivacyValueAllowCloseFriends);
  return { level, hasExceptions };
}

export async function getPrivacySettings(slug: string): Promise<PrivacySetting[]> {
  const client = await getClientForAccount(slug);
  const out: PrivacySetting[] = [];
  for (const [key, def] of Object.entries(PRIVACY_KEYS) as [PrivacyKey, (typeof PRIVACY_KEYS)[PrivacyKey]][]) {
    try {
      const r = await client.invoke(new Api.account.GetPrivacy({ key: def.make() }));
      out.push({ key, label: def.label, ...summarize(r.rules) });
    } catch { /* key not supported for this account */ }
  }
  return out;
}

export async function setPrivacy(slug: string, key: PrivacyKey, level: PrivacyLevel) {
  const def = PRIVACY_KEYS[key];
  if (!def) throw new Error(`Unknown privacy key: ${key}`);
  const rules: Api.TypeInputPrivacyRule[] =
    level === 'everybody' ? [new Api.InputPrivacyValueAllowAll()]
    : level === 'contacts' ? [new Api.InputPrivacyValueAllowContacts(), new Api.InputPrivacyValueDisallowAll()]
    : [new Api.InputPrivacyValueDisallowAll()];
  const client = await getClientForAccount(slug);
  try {
    await client.invoke(new Api.account.SetPrivacy({ key: def.make(), rules }));
  } catch (err) {
    if (/PREMIUM_ACCOUNT_REQUIRED/.test(String((err as Error)?.message || err))) throw new Error('This setting requires Telegram Premium');
    throw err;
  }
}

// ── Account self-destruct ────────────────────────────────────────────────────
export const ACCOUNT_TTL_DAYS = [30, 90, 180, 365, 548, 730];

export async function getAccountTtl(slug: string): Promise<number> {
  const client = await getClientForAccount(slug);
  const r = await client.invoke(new Api.account.GetAccountTTL());
  return r.days;
}

export async function setAccountTtl(slug: string, days: number) {
  if (!ACCOUNT_TTL_DAYS.includes(days)) throw new Error(`days must be one of ${ACCOUNT_TTL_DAYS.join(', ')}`);
  const client = await getClientForAccount(slug);
  await client.invoke(new Api.account.SetAccountTTL({ ttl: new Api.AccountDaysTTL({ days }) }));
}
