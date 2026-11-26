import { NextRequest, NextResponse } from 'next/server';
import { activeAccount, fail } from '@/lib/account-route';
import { clientIp } from '@/lib/session';
import prisma from '@/lib/prisma';
import { jobRunner } from '@/server/jobs/runner';
import { resolveChat } from '@/server/telegram/dialogs';
import { createLog } from '@/server/services/log';
import { MAX_RECIPIENTS, MAX_TEXT, type SendOptions } from '@/server/telegram/send';

const GROUPS: Record<string, object> = {
  contacts: { type: 'PRIVATE' },
  groups: { type: { in: ['GROUP', 'SUPERGROUP'] }, isMember: true },
  adminChannels: { type: 'CHANNEL', isMember: true, OR: [{ isAdmin: true }, { isOwner: true }, { isCreator: true }] },
};

/** GET ?group=contacts|groups|adminChannels → recipient identifiers from synced chats */
export async function GET(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  const group = new URL(request.url).searchParams.get('group') || '';
  const where = GROUPS[group];
  if (!where) return fail('Unknown group', 400);
  const chats = await prisma.chat.findMany({
    where: { accountId: account.id, ...where }, select: { telegramId: true, username: true },
    orderBy: { lastMessageDate: 'desc' }, take: MAX_RECIPIENTS,
  });
  return NextResponse.json({ success: true, data: chats.map((c) => (c.username ? `@${c.username}` : c.telegramId)) });
}

/**
 * POST { text, recipients: string[] | string, delaySeconds?, silent?, noLinkPreview?, parseMode?, scheduleAt?, confirm? }
 *  - without confirm → review (resolves the first recipients, returns counts and warnings)
 *  - with confirm    → queues a SEND_MESSAGE job
 */
export async function POST(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  const body = await request.json().catch(() => ({}));

  const text = typeof body.text === 'string' ? body.text : '';
  const list: string[] = Array.isArray(body.recipients) ? body.recipients : String(body.recipients || '').split(/[\n,]+/);
  const recipients = Array.from(new Set(list.map((s) => String(s).trim()).filter(Boolean)));
  const minDelay = recipients.length > 1 ? 2 : 0;
  const delaySeconds = Math.min(120, Math.max(minDelay, Number.isFinite(Number(body.delaySeconds)) ? Number(body.delaySeconds) : 3));
  const parseMode: SendOptions['parseMode'] = body.parseMode === 'md' || body.parseMode === 'html' ? body.parseMode : undefined;
  let scheduleAt: string | undefined;

  if (!text.trim()) return fail('Message text is required', 400);
  if (text.length > MAX_TEXT) return fail(`Message is longer than ${MAX_TEXT} characters`, 400);
  if (!recipients.length) return fail('Add at least one recipient', 400);
  if (recipients.length > MAX_RECIPIENTS) return fail(`At most ${MAX_RECIPIENTS} recipients per job`, 400);
  if (body.scheduleAt) {
    const d = new Date(body.scheduleAt);
    if (Number.isNaN(d.getTime())) return fail('Invalid schedule date', 400);
    if (d.getTime() < Date.now() + 60_000) return fail('Schedule time must be at least 1 minute in the future', 400);
    if (d.getTime() > Date.now() + 365 * 86_400_000) return fail('Telegram allows scheduling up to 365 days ahead', 400);
    scheduleAt = d.toISOString();
  }

  try {
    if (!body.confirm) {
      const sample: { raw: string; title: string | null; type: string | null; ok: boolean }[] = [];
      for (const r of recipients.slice(0, 5)) {
        const info = await resolveChat(account.slug, r, account.id);
        sample.push({ raw: r, title: info?.title || null, type: info?.type || null, ok: !!info });
      }
      const warnings: string[] = [];
      if (sample.some((s) => !s.ok)) warnings.push('Some recipients could not be resolved; they will be reported as failed.');
      if (recipients.length > 30) warnings.push('Mass-messaging people who did not ask for it gets accounts limited or banned by Telegram. Only message chats that expect it.');
      const etaSeconds = (recipients.length - 1) * delaySeconds;
      return NextResponse.json({
        success: true,
        data: { review: true, count: recipients.length, sample, delaySeconds, etaSeconds, scheduleAt, warning: warnings.join(' ') || undefined },
      });
    }

    const send: SendOptions = { text, recipients, delaySeconds, silent: !!body.silent, noLinkPreview: !!body.noLinkPreview, parseMode, scheduleAt };
    const target = recipients.length === 1 ? recipients[0] : `${recipients.length} recipients`;
    const job = await jobRunner.createJob({ type: 'SEND_MESSAGE', accountId: account.id, destinationChatRaw: target, totalItems: recipients.length, options: { send } });
    await createLog({
      action: 'SEND', accountId: account.id, destChat: target,
      details: `Queued job #${job.id}: ${scheduleAt ? `schedule for ${scheduleAt}` : 'send now'} (${text.length} chars)`,
      ipAddress: clientIp(request),
    });
    return NextResponse.json({ success: true, data: { jobId: job.id } });
  } catch (err) {
    return fail(err);
  }
}
