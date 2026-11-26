/**
 * Send a text message to one or more chats (the SEND_MESSAGE job).
 *
 * - Recipients are processed in order; the job checkpoint is the index of the next recipient,
 *   so a paused / restarted job continues where it stopped and never double-sends.
 * - A delay between recipients keeps the account well below Telegram's spam limits.
 * - With `scheduleAt` Telegram itself delivers the message later (native scheduled messages).
 */
import { getClientForAccount } from './client';
import { resolvePeer } from './peer';
import { shouldStop, baseCounts, progressWriter } from '../jobs/control';
import { sleep } from '../../lib/utils';
import logger from '../../lib/logger';

export interface SendOptions {
  text: string;
  recipients: string[];
  delaySeconds?: number;
  silent?: boolean;
  noLinkPreview?: boolean;
  /** 'md' (Markdown), 'html' or undefined for plain text */
  parseMode?: 'md' | 'html';
  /** ISO date — schedule delivery in Telegram instead of sending now */
  scheduleAt?: string;
}

export const MAX_RECIPIENTS = 500;
export const MAX_TEXT = 4096;

export async function sendToRecipients(opts: SendOptions & {
  slug: string; accountId: number; jobId?: number; checkpoint?: number;
}): Promise<{ sent: number; failed: number; errors: string[]; cancelled: boolean }> {
  const client = await getClientForAccount(opts.slug);
  const start = opts.checkpoint && opts.checkpoint > 0 ? opts.checkpoint : 0;
  const base = await baseCounts(opts.jobId, start > 0);
  const write = progressWriter(opts.jobId, base, 1000);
  const delayMs = Math.max(0, opts.delaySeconds ?? 3) * 1000;
  const schedule = opts.scheduleAt ? Math.floor(new Date(opts.scheduleAt).getTime() / 1000) : undefined;

  let sent = 0, failed = 0;
  const errors: string[] = [];

  for (let i = start; i < opts.recipients.length; i++) {
    if (await shouldStop(opts.jobId)) return { sent, failed, errors, cancelled: true };
    const raw = opts.recipients[i];
    try {
      const target = await resolvePeer(client, opts.accountId, raw);
      await client.sendMessage(target.peer, {
        message: opts.text,
        silent: !!opts.silent,
        linkPreview: !opts.noLinkPreview,
        parseMode: opts.parseMode || false,
        ...(schedule ? { schedule } : {}),
      });
      sent++;
    } catch (err) {
      failed++;
      const msg = String((err as Error)?.message || err);
      if (errors.length < 20) errors.push(`${raw}: ${msg}`);
      logger.warn(`SEND_MESSAGE to ${raw} failed`, { error: msg });
    }
    await write({ processedItems: sent, failedItems: failed, checkpoint: String(i + 1) }, true);
    if (delayMs && i < opts.recipients.length - 1) await sleep(delayMs);
  }
  return { sent, failed, errors, cancelled: false };
}
