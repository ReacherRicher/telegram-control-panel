import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import { indexChatMessages } from '../telegram/messages';
import { forwardMessages } from '../telegram/forward';
import { downloadMedia } from '../telegram/download';
import { exportMessages } from '../telegram/export';
import { deleteMessages } from '../telegram/delete';
import { joinChat, leaveChat, leaveAllGroups, leaveAllChannels, deleteAllPrivateChats, markChatAsRead } from '../telegram/dialogs';
import { sendToRecipients, type SendOptions } from '../telegram/send';
import { createLog } from '../services/log';
import type { JobType, ContentFilter, ExportFormat, DeletionMode, LogAction } from '../../types';

export interface JobOptions {
  dropAuthor?: boolean;
  /** SEND_MESSAGE */
  send?: SendOptions;
}

type JobWithAccount = NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>> & { account: { slug: string } };

const LOG_ACTION: Partial<Record<JobType, LogAction>> = {
  INDEX_MESSAGES: 'INDEX', DOWNLOAD_MEDIA: 'DOWNLOAD', FORWARD_MESSAGES: 'FORWARD', FORWARD_AND_DELETE: 'FORWARD',
  EXPORT_MESSAGES: 'EXPORT', DELETE_MESSAGES: 'DELETE', JOIN_CHAT: 'JOIN', LEAVE_CHAT: 'LEAVE',
  LEAVE_ALL_GROUPS: 'LEAVE', LEAVE_ALL_CHANNELS: 'LEAVE', DELETE_ALL_PRIVATE_CHATS: 'DELETE', MARK_READ: 'MARK_READ',
  SEND_MESSAGE: 'SEND',
};

/**
 * Job execution.
 *
 * Jobs are ONLY executed by the worker loop (scripts/worker.ts or the embedded worker, see instrumentation.ts).
 * API routes just create QUEUED jobs. Previously both the web process and the worker ran jobs,
 * so the same job could run twice (double forwards / deletes).
 */
export class JobRunner {
  private running = new Set<number>();

  async createJob(params: {
    type: JobType;
    accountId: number;
    sourceChatRaw?: string;
    destinationChatRaw?: string;
    sourceChatId?: number;
    destinationChatId?: number;
    contentFilter?: ContentFilter;
    dateFrom?: Date;
    dateTo?: Date;
    formatOption?: ExportFormat;
    deletionMode?: DeletionMode;
    totalItems?: number;
    options?: JobOptions;
  }) {
    const job = await prisma.job.create({
      data: {
        type: params.type,
        accountId: params.accountId,
        status: 'QUEUED',
        sourceChatRaw: params.sourceChatRaw,
        destinationChatRaw: params.destinationChatRaw,
        sourceChatId: params.sourceChatId,
        destinationChatId: params.destinationChatId,
        contentFilter: params.contentFilter || 'ALL',
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        formatOption: params.formatOption,
        deletionMode: params.deletionMode,
        totalItems: params.totalItems || 0,
        options: params.options ? JSON.stringify(params.options) : undefined,
      },
    });
    logger.info(`Job created: #${job.id} ${job.type} for account ${params.accountId}`);
    return job;
  }

  /** Atomically claim a QUEUED (or orphaned RUNNING) job. Returns false if someone else changed it. */
  private async claim(jobId: number): Promise<boolean> {
    const r = await prisma.job.updateMany({
      where: { id: jobId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'RUNNING', startedAt: new Date(), error: null },
    });
    return r.count === 1;
  }

  async runJob(jobId: number) {
    if (this.running.has(jobId)) return;
    this.running.add(jobId);
    try {
      if (!(await this.claim(jobId))) return;
      const job = await prisma.job.findUnique({ where: { id: jobId }, include: { account: { select: { slug: true } } } });
      if (!job) return;

      try {
        const summary = await this.executeJob(job as JobWithAccount);
        // Respect a cancel that happened while running — don't overwrite it with COMPLETED
        const current = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
        const finalStatus = current?.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';
        await prisma.job.update({
          where: { id: jobId },
          data: { status: finalStatus, completedAt: new Date(), ...(summary?.note ? { note: summary.note } : {}) },
        });
        logger.info(`Job #${jobId} ${finalStatus.toLowerCase()}`);
        const latest = await prisma.job.findUnique({ where: { id: jobId } });
        await createLog({
          action: LOG_ACTION[job.type as JobType] || 'ERROR', accountId: job.accountId,
          details: `Job #${jobId} ${job.type} ${finalStatus.toLowerCase()}${summary?.note ? ` — ${summary.note}` : ''}`,
          sourceChat: job.sourceChatRaw || undefined, destChat: job.destinationChatRaw || undefined,
          itemCount: latest?.totalItems, successCount: latest?.processedItems, failCount: latest?.failedItems,
        });
      } catch (err: unknown) {
        const errMsg = String((err as Error)?.message || err);
        await prisma.job.update({ where: { id: jobId }, data: { status: 'FAILED', error: errMsg, completedAt: new Date() } });
        logger.error(`Job #${jobId} failed`, { error: errMsg });
        await createLog({ action: 'ERROR', accountId: job.accountId, details: `Job #${jobId} ${job.type} failed: ${errMsg}`, sourceChat: job.sourceChatRaw || undefined });
      }
    } finally {
      this.running.delete(jobId);
    }
  }

  private async executeJob(job: JobWithAccount): Promise<{ note?: string } | void> {
    const slug = job.account?.slug;
    if (!slug) throw new Error(`Job #${job.id}: no account slug found`);

    const accountId = job.accountId;
    const sourceChatRaw = job.sourceChatRaw || '';
    const destChatRaw = job.destinationChatRaw || '';
    const checkpoint = job.checkpoint ? parseInt(job.checkpoint, 10) || undefined : undefined;
    const contentFilter = (job.contentFilter as ContentFilter) || 'ALL';
    const dateFrom = job.dateFrom || undefined;
    const dateTo = job.dateTo || undefined;
    const options: JobOptions = job.options ? JSON.parse(job.options) : {};
    const setCounts = (data: { processedItems?: number; failedItems?: number; totalItems?: number }) =>
      prisma.job.update({ where: { id: job.id }, data });
    /** total = processed + failed as recorded in the DB (includes earlier runs when resumed) */
    const finalizeTotals = async () => {
      const j = await prisma.job.findUnique({ where: { id: job.id }, select: { processedItems: true, failedItems: true } });
      if (j) await setCounts({ totalItems: j.processedItems + j.failedItems });
    };

    switch (job.type as JobType) {
      case 'INDEX_MESSAGES': {
        const dbChat = job.sourceChatId
          ? await prisma.chat.findFirst({ where: { id: job.sourceChatId, accountId } })
          : await prisma.chat.findFirst({ where: { accountId, OR: [{ telegramId: sourceChatRaw }, { username: sourceChatRaw.replace('@', '') }] } });
        if (!dbChat) throw new Error(`Chat not found in local DB: ${sourceChatRaw}. Run Sync first.`);
        const r = await indexChatMessages({ slug, accountId, chatId: dbChat.id, telegramChatId: dbChat.telegramId, jobId: job.id, dateFrom, dateTo, checkpoint });
        void r;
        await finalizeTotals();
        return;
      }

      case 'FORWARD_MESSAGES':
      case 'FORWARD_AND_DELETE': {
        const r = await forwardMessages({
          slug, accountId, jobId: job.id, sourceChatId: sourceChatRaw, destinationChatId: destChatRaw,
          contentFilter, dateFrom, dateTo, checkpoint, dropAuthor: options.dropAuthor,
          deleteAfter: job.type === 'FORWARD_AND_DELETE',
        });
        await finalizeTotals();
        return { note: [r.note, r.skipped ? `${r.skipped} skipped (forwarding restricted)` : ''].filter(Boolean).join(' ') || undefined };
      }

      case 'DOWNLOAD_MEDIA': {
        const r = await downloadMedia({ slug, accountId, jobId: job.id, sourceChatId: sourceChatRaw, contentFilter, dateFrom, dateTo, checkpoint });
        await finalizeTotals();
        const mb = (r.totalBytes / 1024 / 1024).toFixed(1);
        return { note: `${r.downloaded} files downloaded (${mb} MB)${r.skipped ? `, ${r.skipped} already on disk` : ''}. Saved in storage/downloads/${slug}/` };
      }

      case 'EXPORT_MESSAGES': {
        const r = await exportMessages({ slug, accountId, jobId: job.id, sourceChatId: sourceChatRaw, contentFilter, format: (job.formatOption as ExportFormat) || 'JSON', dateFrom, dateTo });
        if (!r.cancelled) await prisma.job.update({ where: { id: job.id }, data: { processedItems: r.exported, totalItems: r.exported, outputPath: r.outputPath } });
        return;
      }

      case 'DELETE_MESSAGES': {
        const r = await deleteMessages({
          slug, accountId, jobId: job.id, sourceChatId: sourceChatRaw, contentFilter,
          deletionMode: (job.deletionMode as DeletionMode) || 'FOR_ME', dateFrom, dateTo, checkpoint,
        });
        await finalizeTotals();
        return { note: [r.note, r.skipped ? `${r.skipped} could not be deleted (not allowed)` : ''].filter(Boolean).join(' ') || undefined };
      }

      case 'JOIN_CHAT': {
        const r = await joinChat(slug, sourceChatRaw);
        if (!r.success) throw new Error(r.error);
        await setCounts({ processedItems: 1, totalItems: 1 });
        return { note: r.error };
      }

      case 'LEAVE_CHAT': {
        const r = await leaveChat(slug, accountId, sourceChatRaw);
        if (!r.success) throw new Error(r.error);
        await prisma.chat.updateMany({ where: { accountId, telegramId: r.telegramId }, data: { isMember: false } });
        await setCounts({ processedItems: 1, totalItems: 1 });
        return;
      }

      case 'LEAVE_ALL_GROUPS': {
        const r = await leaveAllGroups(slug, accountId, job.id);
        await setCounts({ processedItems: r.left, failedItems: r.failed });
        return;
      }

      case 'LEAVE_ALL_CHANNELS': {
        const r = await leaveAllChannels(slug, accountId, job.id);
        await setCounts({ processedItems: r.left, failedItems: r.failed });
        return;
      }

      case 'DELETE_ALL_PRIVATE_CHATS': {
        const mode = job.deletionMode === 'FOR_EVERYONE' ? 'FOR_EVERYONE' : 'FOR_ME';
        const r = await deleteAllPrivateChats(slug, accountId, mode, job.id);
        await setCounts({ processedItems: r.deleted, failedItems: r.failed });
        return;
      }

      case 'MARK_READ': {
        const r = await markChatAsRead(slug, accountId, sourceChatRaw);
        if (!r.success) throw new Error(r.error);
        await setCounts({ processedItems: 1, totalItems: 1 });
        return;
      }

      case 'SEND_MESSAGE': {
        if (!options.send?.text || !options.send.recipients?.length) throw new Error('Job has no message or recipients');
        const r = await sendToRecipients({ ...options.send, slug, accountId, jobId: job.id, checkpoint });
        if (r.cancelled) return;
        if (r.sent === 0 && r.failed > 0) throw new Error(r.errors.slice(0, 3).join(' | ') || 'All sends failed');
        const verb = options.send.scheduleAt ? 'scheduled' : 'sent';
        return { note: `${r.sent} ${verb}${r.failed ? `, ${r.failed} failed — ${r.errors.slice(0, 3).join(' | ')}` : ''}` };
      }

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  isRunning(jobId: number) { return this.running.has(jobId); }
  getRunningJobs() { return Array.from(this.running); }
}

const globalForRunner = globalThis as unknown as { jobRunner: JobRunner | undefined };
export const jobRunner = (globalForRunner.jobRunner ??= new JobRunner());
