/**
 * Multi-account Telegram client manager.
 * One TelegramClient instance per account slug, kept alive in a Map.
 */
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { LogLevel } from 'telegram/extensions/Logger';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../lib/logger';

const SESSION_DIR = path.join(process.cwd(), 'sessions');

// In-process client pool: slug → client. Kept on globalThis so Next.js dev hot-reload
// doesn't open another connection with the same auth key on every edit.
const g = globalThis as unknown as { __tgClientPool?: Map<string, TelegramClient>; __tgConnecting?: Map<string, Promise<TelegramClient>> };
const clientPool = (g.__tgClientPool ??= new Map<string, TelegramClient>());
const connecting = (g.__tgConnecting ??= new Map<string, Promise<TelegramClient>>());

function getApiCredentials() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env');
  }
  return { apiId, apiHash };
}

export function sessionFilePath(slug: string): string {
  return path.join(SESSION_DIR, `${slug}.session`);
}

export function loadSavedSession(slug: string): string {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  const file = sessionFilePath(slug);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim();
  return '';
}

export function saveSession(slug: string, sessionString: string) {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(sessionFilePath(slug), sessionString, 'utf-8');
  logger.info(`Session saved: ${sessionFilePath(slug)}`);
}

export function isSessionSaved(slug: string): boolean {
  const file = sessionFilePath(slug);
  return fs.existsSync(file) && fs.readFileSync(file, 'utf-8').trim().length > 0;
}

/**
 * Get (or create) a connected TelegramClient for the given account slug.
 * The client is cached in clientPool for the lifetime of the process.
 */
export async function getClientForAccount(slug: string): Promise<TelegramClient> {
  const existing = clientPool.get(slug);
  if (existing) {
    // Verify still authorized
    try {
      if (await existing.isUserAuthorized()) return existing;
    } catch {
      clientPool.delete(slug);
    }
  }

  const pending = connecting.get(slug);
  if (pending) return pending;

  const p = (async () => {
    const { apiId, apiHash } = getApiCredentials();
    const savedSession = loadSavedSession(slug);
    if (!savedSession) throw new Error(`Account "${slug}" is not logged in. Open Accounts → Login.`);
    const session = new StringSession(savedSession);

    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 2000,
      autoReconnect: true,
      // Sleep automatically through FloodWaits up to 5 minutes instead of throwing
      floodSleepThreshold: 300,
      appVersion: 'TelegramControlPanel/1.0',
      deviceModel: `TCP-${slug}`,
      systemVersion: 'Node.js',
    });
    client.setLogLevel(LogLevel.ERROR);

    await client.connect();

    // Persist any session update
    const newStr = (client.session as StringSession).save();
    if (newStr && newStr !== savedSession) saveSession(slug, newStr);

    clientPool.set(slug, client);
    logger.info(`Telegram client connected for account: ${slug}`);
    return client;
  })();

  connecting.set(slug, p);
  try {
    return await p;
  } finally {
    connecting.delete(slug);
  }
}

export async function disconnectAccount(slug: string) {
  const client = clientPool.get(slug);
  if (client) {
    try { await client.disconnect(); } catch {}
    clientPool.delete(slug);
    logger.info(`Telegram client disconnected: ${slug}`);
  }
}

export async function disconnectAll() {
  for (const [slug, client] of clientPool) {
    try { await client.disconnect(); } catch {}
    logger.info(`Disconnected: ${slug}`);
  }
  clientPool.clear();
}

export async function checkAccountConnection(slug: string): Promise<boolean> {
  if (!isSessionSaved(slug)) return false;
  try {
    const c = await getClientForAccount(slug);
    return await c.isUserAuthorized();
  } catch {
    return false;
  }
}
