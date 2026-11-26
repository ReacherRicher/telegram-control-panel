import bigInt from 'big-integer';
import { Api } from 'telegram';
import { generateRandomBigInt } from 'telegram/Helpers';
import { getClientForAccount } from './client';
import { resolvePeer } from './peer';
import { messageMatchesFilter, filterToTypes } from './messages';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import { sleep, withRetry } from '../../lib/utils';
import { shouldStop, baseCounts } from '../jobs/control';
import type { ContentFilter } from '../../types';

export interface ForwardOptions {
  slug: string;
  accountId: number;
  jobId: number;
  sourceChatId: string;
  destinationChatId: string;
  contentFilter: ContentFilter;
  dateFrom?: Date;
  dateTo?: Date;
  /** Resume point: highest source message id already handled (iteration is oldest → newest). */
  checkpoint?: number;
  /** Send as a copy without the "Forwarded from" header */
  dropAuthor?: boolean;
  /** After forwarding, delete the new copies from the destination for YOU only */
  deleteAfter?: boolean;
}

export interface ForwardResult { forwarded: number; deleted: number; failed: number; skipped: number; note?: string }

const BATCH = 100; // Telegram max ids per ForwardMessages call

function newIdsFromUpdates(result: Api.TypeUpdates): number[] {
  if (!(result instanceof Api.Updates || result instanceof Api.UpdatesCombined)) return [];
  const byRandom = result.updates.filter((u): u is Api.UpdateMessageID => u instanceof Api.UpdateMessageID).map((u) => u.id);
  if (byRandom.length) return byRandom;
  return result.updates
    .filter((u): u is Api.UpdateNewMessage | Api.UpdateNewChannelMessage => u instanceof Api.UpdateNewMessage || u instanceof Api.UpdateNewChannelMessage)
    .map((u) => u.message.id);
}

/**
 * Forward messages oldest → newest so the destination keeps the original order
 * (the old implementation walked newest → oldest and posted everything in reverse),
 * and resumes correctly from the last forwarded id after pause / restart.
 */
export async function forwardMessages(opts: ForwardOptions): Promise<ForwardResult> {
  const client = await getClientForAccount(opts.slug);
  const src = await resolvePeer(client, opts.accountId, opts.sourceChatId);
  const dst = await resolvePeer(client, opts.accountId, opts.destinationChatId);

  // Deleting "for me only" is impossible in channels/supergroups — it would delete for everyone.
  const canDeleteForMe = opts.deleteAfter && !dst.isChannel;
  const note = opts.deleteAfter && dst.isChannel
    ? 'Destination is a channel/supergroup: Telegram cannot delete messages only for you there, so the forwarded copies were kept.'
    : undefined;

  let forwarded = 0, deleted = 0, failed = 0, skipped = 0;
  const base = await baseCounts(opts.jobId, !!opts.checkpoint);
  let lastHandledId = opts.checkpoint || 0;
  let batch: Api.Message[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const ids = batch.map((m) => m.id);
    const now = new Date();
    try {
      const result = await withRetry(() => client.invoke(new Api.messages.ForwardMessages({
        fromPeer: src.peer,
        toPeer: dst.peer,
        id: ids,
        randomId: ids.map(() => generateRandomBigInt()),
        dropAuthor: opts.dropAuthor || undefined,
      })));
      forwarded += ids.length;

      let itemError: string | undefined = note;
      if (canDeleteForMe) {
        const newIds = newIdsFromUpdates(result);
        if (newIds.length > 0) {
          try {
            await sleep(300);
            await withRetry(() => client.invoke(new Api.messages.DeleteMessages({ id: newIds, revoke: false })));
            deleted += newIds.length;
          } catch (err) {
            itemError = `Forwarded OK, but deleting the copy failed: ${String((err as Error)?.message || err)}`;
            logger.warn('Forward+delete: delete step failed', { jobId: opts.jobId, error: itemError });
          }
        }
      }
      await prisma.jobItem.createMany({
        data: ids.map((id) => ({ jobId: opts.jobId, telegramMessageId: id, status: 'SUCCESS', error: itemError, processedAt: now })),
      });
    } catch (err: unknown) {
      const errMsg = String((err as Error)?.message || err);
      const isBlocked = /CHAT_FORWARDS_RESTRICTED|FORWARD_BLOCKED|noforwards/i.test(errMsg);
      if (isBlocked) skipped += ids.length; else failed += ids.length;
      await prisma.jobItem.createMany({
        data: ids.map((id) => ({
          jobId: opts.jobId, telegramMessageId: id, status: isBlocked ? 'SKIPPED' : 'FAILED',
          error: isBlocked ? 'This chat has forwarding restricted (protected content).' : errMsg, processedAt: now,
        })),
      });
      if (!isBlocked) logger.error('Forward batch error', { jobId: opts.jobId, error: errMsg });
      // Fatal destination problems — no point continuing
      if (/CHAT_WRITE_FORBIDDEN|CHAT_ADMIN_REQUIRED|USER_BANNED_IN_CHANNEL|PEER_ID_INVALID|CHAT_SEND_.*_FORBIDDEN/.test(errMsg)) {
        throw new Error(`Cannot post to destination: ${errMsg}`);
      }
    }
    lastHandledId = ids[ids.length - 1];
    batch = [];
    await prisma.job.update({
      where: { id: opts.jobId },
      data: { processedItems: base.processed + forwarded + skipped, failedItems: base.failed + failed, checkpoint: String(lastHandledId) },
    });
    await sleep(1000);
  };

  const iter = client.iterMessages(src.peer, {
    reverse: true,
    minId: opts.checkpoint || 0,
    // In reverse mode offsetDate = "start from this date upwards"
    offsetDate: !opts.checkpoint && opts.dateFrom ? Math.floor(opts.dateFrom.getTime() / 1000) : undefined,
    waitTime: 1,
  });

  let scanned = 0;
  for await (const msg of iter) {
    if (!(msg instanceof Api.Message)) continue; // service messages can't be forwarded
    if (opts.dateTo && msg.date * 1000 > opts.dateTo.getTime()) break;
    if (opts.dateFrom && msg.date * 1000 < opts.dateFrom.getTime()) continue;

    if (++scanned % 200 === 0 && (await shouldStop(opts.jobId))) { batch = []; break; }
    if (!messageMatchesFilter(msg, opts.contentFilter)) continue;

    // Keep albums together: flush before a new album would overflow the batch
    const last = batch[batch.length - 1];
    const sameAlbum = last && msg.groupedId && last.groupedId && String(last.groupedId) === String(msg.groupedId);
    if (batch.length >= BATCH || (batch.length >= BATCH - 10 && !sameAlbum)) {
      if (await shouldStop(opts.jobId)) { batch = []; break; }
      await flush();
    }
    batch.push(msg);
  }
  if (batch.length && !(await shouldStop(opts.jobId))) await flush();

  return { forwarded, deleted, failed, skipped, note };
}

/**
 * Estimate how many messages an operation will touch.
 * Uses the local index when the chat was indexed, otherwise Telegram's total count.
 */
export async function estimateMessageCount(
  slug: string, accountId: number, source: string, contentFilter: ContentFilter, dateFrom?: Date, dateTo?: Date,
): Promise<{ count: number; exact: boolean }> {
  try {
    const client = await getClientForAccount(slug);
    const src = await resolvePeer(client, accountId, source);

    const dbChat = await prisma.chat.findFirst({ where: { accountId, telegramId: src.telegramId } });
    if (dbChat && dbChat.lastIndexedAt) {
      const types = filterToTypes(contentFilter);
      const date: { gte?: Date; lte?: Date } = {};
      if (dateFrom) date.gte = dateFrom;
      if (dateTo) date.lte = dateTo;
      const count = await prisma.message.count({
        where: {
          chatId: dbChat.id,
          ...(types ? { messageType: { in: types } } : {}),
          ...(contentFilter === 'LINKS' ? { hasLinks: true } : {}),
          ...(Object.keys(date).length ? { date } : {}),
        },
      });
      return { count, exact: !dateTo || dateTo <= (dbChat.lastIndexedAt ?? new Date()) };
    }

    const result = await client.invoke(new Api.messages.GetHistory({
      peer: src.peer, offsetId: 0, offsetDate: 0, addOffset: 0, limit: 1, maxId: 0, minId: 0, hash: bigInt(0),
    }));
    if (result instanceof Api.messages.MessagesSlice || result instanceof Api.messages.ChannelMessages) return { count: result.count, exact: false };
    if (result instanceof Api.messages.Messages) return { count: result.messages.length, exact: false };
    return { count: 0, exact: false };
  } catch {
    return { count: 0, exact: false };
  }
}
