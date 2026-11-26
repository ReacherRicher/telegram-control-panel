import { Api } from 'telegram';
import { getClientForAccount } from './client';
import { resolvePeer } from './peer';
import { messageMatchesFilter } from './messages';
import logger from '../../lib/logger';
import { sleep, withRetry } from '../../lib/utils';
import { shouldStop, progressWriter, baseCounts } from '../jobs/control';
import type { ContentFilter, DeletionMode } from '../../types';

export interface DeleteOptions {
  slug: string;
  accountId: number;
  jobId: number;
  sourceChatId: string;
  deletionMode: DeletionMode;
  contentFilter?: ContentFilter;
  dateFrom?: Date;
  dateTo?: Date;
  /** Resume point: smallest message id already handled (iteration is newest → oldest). */
  checkpoint?: number;
}

export async function deleteMessages(opts: DeleteOptions): Promise<{ deleted: number; failed: number; skipped: number; note?: string }> {
  const client = await getClientForAccount(opts.slug);
  const src = await resolvePeer(client, opts.accountId, opts.sourceChatId);
  const progress = progressWriter(opts.jobId, await baseCounts(opts.jobId, !!opts.checkpoint));
  const revoke = opts.deletionMode === 'FOR_EVERYONE';

  // In channels/supergroups deletion is always for everyone, and non-admins can only delete their own messages.
  // Without this filter every batch containing someone else's message failed as a whole.
  const ownOnly = src.isChannel && !src.isAdmin;
  const note = src.isChannel
    ? `In ${src.isBroadcast ? 'channels' : 'supergroups'} messages are always deleted for everyone${ownOnly ? '; only your own messages were deleted (you are not an admin)' : ''}.`
    : undefined;

  let deleted = 0, failed = 0, skipped = 0;
  let batch: number[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const ids = batch;
    batch = [];
    try {
      if (src.isChannel) {
        await withRetry(() => client.invoke(new Api.channels.DeleteMessages({ channel: src.peer as unknown as Api.TypeInputChannel, id: ids })));
      } else {
        await withRetry(() => client.invoke(new Api.messages.DeleteMessages({ id: ids, revoke })));
      }
      deleted += ids.length;
    } catch (err: unknown) {
      const errMsg = String((err as Error)?.message || err);
      if (errMsg.includes('MESSAGE_DELETE_FORBIDDEN')) skipped += ids.length;
      else { failed += ids.length; logger.error('Delete error', { jobId: opts.jobId, error: errMsg }); }
    }
    await progress({ processedItems: deleted + skipped, failedItems: failed, checkpoint: String(ids[ids.length - 1]) }, true);
    await sleep(500);
  };

  const iter = client.iterMessages(src.peer, {
    maxId: opts.checkpoint || 0,
    offsetDate: opts.dateTo ? Math.floor(opts.dateTo.getTime() / 1000) : undefined,
    waitTime: 1,
  });

  for await (const item of iter) {
    // iterMessages also yields service messages (joins, pins…) at runtime — those can be deleted too
    const msg = item as unknown as Api.Message | Api.MessageService;
    if (!(msg instanceof Api.Message) && !(msg instanceof Api.MessageService)) continue;
    if (opts.dateFrom && msg.date * 1000 < opts.dateFrom.getTime()) break;
    if (opts.dateTo && msg.date * 1000 > opts.dateTo.getTime()) continue;
    if (ownOnly && !msg.out) continue;
    if (opts.contentFilter && opts.contentFilter !== 'ALL' && !(msg instanceof Api.Message && messageMatchesFilter(msg, opts.contentFilter))) continue;

    batch.push(msg.id);
    if (batch.length >= 100) {
      if (await shouldStop(opts.jobId)) { batch = []; break; }
      await flush();
    }
  }
  if (batch.length && !(await shouldStop(opts.jobId))) await flush();

  return { deleted, failed, skipped, note };
}
