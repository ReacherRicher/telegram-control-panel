#!/usr/bin/env ts-node
// Telegram login script — supports multiple accounts
// Usage:
//   npm run login                         → interactive slug prompt
//   npm run login -- --slug=john_doe      → specify slug directly
//   npm run login -- --slug=john_doe --label="John Doe"

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// Load .env before importing modules that need env vars
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

const SESSION_DIR = path.join(__dirname, '..', 'sessions');
const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Parse CLI args ──────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

// ── Prompt helpers ───────────────────────────────────────────────────────────

async function prompt(question: string, hideInput = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hideInput) {
      process.stdout.write(question);
      let input = '';
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      const onData = (char: string) => {
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdout.write('\n');
          process.stdin.removeListener('data', onData);
          rl.close();
          resolve(input);
        } else if (char === '\u0003') {
          process.exit();
        } else if (char === '\u007f') {
          if (input.length > 0) input = input.slice(0, -1);
        } else {
          input += char;
        }
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── Prisma (lazy import so env is loaded first) ───────────────────────────────

async function upsertAccount(slug: string, label: string, sessionFile: string, user: {
  telegramId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  isPremium?: boolean;
  isVerified?: boolean;
}) {
  // Dynamic import to avoid Prisma loading before env is set
  const { default: prisma } = await import('../lib/prisma');
  await prisma.account.upsert({
    where: { slug },
    create: {
      slug,
      label,
      sessionFile,
      telegramId: user.telegramId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: user.phone,
      isPremium: user.isPremium ?? false,
      isVerified: user.isVerified ?? false,
    },
    update: {
      label,
      sessionFile,
      telegramId: user.telegramId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: user.phone,
      isPremium: user.isPremium ?? false,
      isVerified: user.isVerified ?? false,
    },
  });
  await prisma.$disconnect();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n===========================================');
  console.log('  TelegramControlPanel — Account Login');
  console.log('===========================================\n');

  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';

  if (!apiId || !apiHash || apiHash === 'YOUR_API_HASH_HERE') {
    console.error('ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.');
    console.error('Get your credentials from: https://my.telegram.org/apps');
    process.exit(1);
  }

  // Determine slug (account identifier)
  let slug = getArg('slug');
  let label = getArg('label');

  if (!slug) {
    console.log('Each Telegram account needs a unique slug (e.g. "john_doe", "work_account").');
    slug = await prompt('Account slug (letters, numbers, underscores):\n> ');
    slug = slugify(slug);
    if (!slug) {
      console.error('ERROR: Slug cannot be empty.');
      process.exit(1);
    }
  } else {
    slug = slugify(slug);
  }

  if (!label) {
    label = await prompt(`Display label for "${slug}" (e.g. "John Doe — Personal"):\n> `);
    if (!label) label = slug;
  }

  console.log(`\nAccount slug : ${slug}`);
  console.log(`Display label: ${label}\n`);

  const SESSION_FILE = path.join(SESSION_DIR, `${slug}.session`);

  // Ensure dirs exist
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // ── Check existing session ──────────────────────────────────────────────

  if (fs.existsSync(SESSION_FILE)) {
    const sessionStr = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
    if (sessionStr) {
      const existingSession = new StringSession(sessionStr);
      const existingClient = new TelegramClient(existingSession, apiId, apiHash, {
        connectionRetries: 3,
        appVersion: 'TelegramControlPanel/1.0',
      });
      try {
        await existingClient.connect();
        const authorized = await existingClient.isUserAuthorized();
        if (authorized) {
          const me = await existingClient.getMe() as unknown as { firstName?: string; lastName?: string; username?: string; id: bigint | number; phone?: string; premium?: boolean; verified?: boolean };
          console.log('✓ Existing session is valid.\n');
          console.log('Account:');
          const name = [me.firstName, me.lastName].filter(Boolean).join(' ');
          console.log(`  Name     : ${name}`);
          if (me.username) console.log(`  Username : @${me.username}`);
          console.log(`  Telegram ID: ${me.id}`);
          if (me.phone) console.log(`  Phone    : +${me.phone}`);
          console.log(`\nSession file : ${SESSION_FILE}`);
          await existingClient.disconnect();

          // Still upsert account record in DB to ensure it exists
          try {
            await upsertAccount(slug!, label!, SESSION_FILE, {
              telegramId: String(me.id),
              firstName: me.firstName,
              lastName: me.lastName,
              username: me.username,
              phone: me.phone,
              isPremium: !!(me as Record<string, unknown>).premium,
              isVerified: !!(me as Record<string, unknown>).verified,
            });
            console.log('✓ Account record updated in database.\n');
          } catch (dbErr) {
            console.warn('Warning: Could not update database record:', (dbErr as Error).message);
            console.warn('Run "npm run db:migrate" if the database is not yet initialized.\n');
          }

          console.log('Session already saved. No login needed.\n');
          process.exit(0);
        }
      } catch {}
      await existingClient.disconnect().catch(() => {});
    }
  }

  // ── New login flow ──────────────────────────────────────────────────────

  const phone = await prompt('Phone number (with country code, e.g. +1234567890):\n> ');

  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    appVersion: 'TelegramControlPanel/1.0',
    deviceModel: 'TelegramControlPanel',
  });

  await client.start({
    phoneNumber: async () => phone,
    password: async () => {
      return await prompt('Two-factor authentication password (leave blank if none):\n> ', true);
    },
    phoneCode: async () => {
      return await prompt('Telegram verification code:\n> ');
    },
    onError: (err) => {
      console.error('Login error:', err.message);
    },
  });

  const sessionString = (client.session as StringSession).save();
  fs.writeFileSync(SESSION_FILE, sessionString, 'utf-8');

  const me = await client.getMe() as unknown as { firstName?: string; lastName?: string; username?: string; id: bigint | number; phone?: string };

  console.log('\n✓ Telegram login successful!\n');
  console.log('Account:');
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ');
  console.log(`  Name     : ${name}`);
  if (me.username) console.log(`  Username : @${me.username}`);
  console.log(`  Telegram ID: ${me.id}`);
  if (me.phone) console.log(`  Phone    : +${me.phone}`);
  console.log(`\nSession saved to: ${SESSION_FILE}`);

  // Upsert account in database
  try {
    await upsertAccount(slug!, label!, SESSION_FILE, {
      telegramId: String(me.id),
      firstName: me.firstName,
      lastName: me.lastName,
      username: me.username,
      phone: me.phone,
    });
    console.log('✓ Account record saved to database.\n');
  } catch (dbErr) {
    console.warn('Warning: Could not save to database:', (dbErr as Error).message);
    console.warn('Run "npm run db:migrate" first, then re-run login.\n');
  }

  console.log('You can now run: npm run dev\n');

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
