import { NextRequest, NextResponse } from 'next/server';
import { requireAccount, parseDateFrom, parseDateTo, clientIp } from '@/lib/session';
import prisma from '@/lib/prisma';
import { jobRunner } from '@/server/jobs/runner';
import { resolveChat, previewInvite } from '@/server/telegram/dialogs';
import { parseInviteHash } from '@/server/telegram/peer';
import { estimateMessageCount } from '@/server/telegram/forward';
import { createLog } from '@/server/services/log';
import type { JobType, ContentFilter, ExportFormat, DeletionMode, LogAction } from '@/types';

const BULK_OPS: JobType[] = ['LEAVE_ALL_GROUPS', 'LEAVE_ALL_CHANNELS', 'DELETE_ALL_PRIVATE_CHATS'];
const SINGLE_OPS: JobType[] = [
  'FORWARD_MESSAGES', 'FORWARD_AND_DELETE', 'DOWNLOAD_MEDIA', 'EXPORT_MESSAGES',
  'DELETE_MESSAGES', 'INDEX_MESSAGES', 'JOIN_CHAT', 'LEAVE_CHAT', 'MARK_READ',
];
const COUNTED_OPS: JobType[] = ['FORWARD_MESSAGES', 'FORWARD_AND_DELETE', 'EXPORT_MESSAGES', 'DELETE_MESSAGES', 'DOWNLOAD_MEDIA', 'INDEX_MESSAGES'];
const FILTERS: ContentFilter[] = ['ALL', 'PHOTOS', 'VIDEOS', 'DOCUMENTS', 'AUDIO', 'VOICE', 'GIFS', 'STICKERS', 'TEXT', 'LINKS'];
const LOG_ACTION: Record<string, LogAction> = {
  FORWARD_MESSAGES: 'FORWARD', FORWARD_AND_DELETE: 'FORWARD', DOWNLOAD_MEDIA: 'DOWNLOAD', EXPORT_MESSAGES: 'EXPORT',
  DELETE_MESSAGES: 'DELETE', INDEX_MESSAGES: 'INDEX', JOIN_CHAT: 'JOIN', LEAVE_CHAT: 'LEAVE', MARK_READ: 'MARK_READ',
  LEAVE_ALL_GROUPS: 'LEAVE', LEAVE_ALL_CHANNELS: 'LEAVE', DELETE_ALL_PRIVATE_CHATS: 'DELETE',
};

function bad(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

async function handlePost(request: NextRequest) {
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return bad('Account not found', 404);

  const body = await request.json().catch(() => ({}));
  const operation = String(body.operation || '') as JobType;
  const source = typeof body.source === 'string' ? body.source.trim() : '';
  const destination = typeof body.destination === 'string' ? body.destination.trim() : '';
  const contentFilter: ContentFilter = FILTERS.includes(body.contentFilter) ? body.contentFilter : 'ALL';
  const dateFrom = parseDateFrom(body.dateFrom);
  const dateTo = parseDateTo(body.dateTo);
  const format = (['JSON', 'CSV', 'TXT', 'HTML'].includes(body.format) ? body.format : 'JSON') as ExportFormat;
  const deletionMode = (body.deletionMode === 'FOR_EVERYONE' ? 'FOR_EVERYONE' : 'FOR_ME') as DeletionMode;
  const dropAuthor = !!body.dropAuthor;
  const confirm = !!body.confirm;

  if (!operation) return bad('operation is required');
  if (dateFrom && dateTo && dateFrom > dateTo) return bad('"Date from" is after "Date to"');

  // ── Bulk operations (no source chat) ─────────────────────────────────────
  if (BULK_OPS.includes(operation)) {
    const where =
      operation === 'LEAVE_ALL_GROUPS' ? { accountId, type: { in: ['GROUP', 'SUPERGROUP'] }, isMember: true }
      : operation === 'LEAVE_ALL_CHANNELS' ? { accountId, type: 'CHANNEL', isMember: true }
      : { accountId, type: { in: ['PRIVATE', 'BOT'] } };
    const count = await prisma.chat.count({ where });

    if (!confirm) {
      const label =
        operation === 'LEAVE_ALL_GROUPS' ? 'groups/supergroups you will leave'
        : operation === 'LEAVE_ALL_CHANNELS' ? 'channels you will leave'
        : `private chats whose history will be deleted (${deletionMode === 'FOR_EVERYONE' ? 'for everyone' : 'for you only'})`;
      const sample = await prisma.chat.findMany({ where, take: 8, select: { title: true, username: true }, orderBy: { title: 'asc' } });
      return NextResponse.json({ success: true, data: { review: true, operation, estimatedCount: count, label, deletionMode, sample } });
    }

    if (count === 0) return bad('Nothing to do — no matching chats. Run Sync first if this looks wrong.');
    const job = await jobRunner.createJob({ type: operation, accountId, deletionMode, totalItems: count });
    await createLog({ action: LOG_ACTION[operation], accountId, details: `Queued job #${job.id}: ${operation} (${count} chats)`, ipAddress: clientIp(request) });
    return NextResponse.json({ success: true, data: { jobId: job.id } });
  }

  // ── Single-chat operations ───────────────────────────────────────────────
  if (!SINGLE_OPS.includes(operation)) return bad(`Unknown operation: ${operation}`);
  if (!source) return bad('Source chat is required');
  const needsDest = operation === 'FORWARD_MESSAGES' || operation === 'FORWARD_AND_DELETE';
  if (needsDest && !destination) return bad('Destination chat is required');

  // Join: the source is usually something we are NOT a member of yet, so don't require resolving it
  if (operation === 'JOIN_CHAT') {
    if (!confirm) {
      const invite = parseInviteHash(source) ? await previewInvite(account.slug, source) : null;
      const info = invite ? null : await resolveChat(account.slug, source, accountId);
      if (!invite && !info) return bad(`Could not find "${source}". Check the username / link.`);
      return NextResponse.json({
        success: true,
        data: {
          review: true, operation,
          source: invite ? { title: invite.title, telegramId: '', type: 'INVITE' } : info,
          estimatedCount: 0,
          warning: invite?.alreadyMember ? 'You are already a member of this chat.' : undefined,
        },
      });
    }
    const job = await jobRunner.createJob({ type: 'JOIN_CHAT', accountId, sourceChatRaw: source, totalItems: 1 });
    await createLog({ action: 'JOIN', accountId, sourceChat: source, details: `Queued job #${job.id}`, ipAddress: clientIp(request) });
    return NextResponse.json({ success: true, data: { jobId: job.id } });
  }

  const sourceInfo = await resolveChat(account.slug, source, accountId);
  if (!sourceInfo) return bad(`Could not resolve source "${source}". Use @username, a t.me link, or pick a synced chat.`);
  let destInfo: Awaited<ReturnType<typeof resolveChat>> = null;
  if (needsDest) {
    destInfo = await resolveChat(account.slug, destination, accountId);
    if (!destInfo) return bad(`Could not resolve destination "${destination}".`);
    if (destInfo.telegramId === sourceInfo.telegramId) return bad('Source and destination are the same chat');
  }

  if (!confirm) {
    let estimatedCount = 0, exact = false;
    if (COUNTED_OPS.includes(operation)) {
      const est = await estimateMessageCount(account.slug, accountId, source, contentFilter, dateFrom, dateTo);
      estimatedCount = est.count; exact = est.exact;
    }
    const warnings: string[] = [];
    if (operation === 'FORWARD_AND_DELETE' && destInfo?.isChannel) {
      warnings.push('Destination is a channel/supergroup: Telegram cannot delete messages only for you there, so the copies will be kept.');
    }
    if (operation === 'DELETE_MESSAGES' && sourceInfo.isChannel) {
      warnings.push(sourceInfo.isAdmin
        ? 'This is a channel/supergroup: messages will be deleted FOR EVERYONE.'
        : 'You are not an admin here: only your own messages will be deleted (for everyone).');
    }
    if (operation === 'LEAVE_CHAT' && !['GROUP', 'SUPERGROUP', 'CHANNEL'].includes(sourceInfo.type)) {
      return bad('Only groups and channels can be left. For private chats use "Delete messages".');
    }
    return NextResponse.json({
      success: true,
      data: {
        review: true, operation, source: sourceInfo, destination: destInfo, contentFilter,
        dateFrom: body.dateFrom || null, dateTo: body.dateTo || null, estimatedCount, exact, format, deletionMode, dropAuthor,
        warning: warnings.join(' ') || undefined,
      },
    });
  }

  // ── Confirm: create job ──────────────────────────────────────────────────
  const srcDbChat = await prisma.chat.findFirst({ where: { accountId, telegramId: sourceInfo.telegramId } });
  const dstDbChat = destInfo ? await prisma.chat.findFirst({ where: { accountId, telegramId: destInfo.telegramId } }) : null;

  if (operation === 'INDEX_MESSAGES' && !srcDbChat) return bad('This chat is not in the local DB yet. Run Sync first.');

  const estimate = COUNTED_OPS.includes(operation) && operation !== 'EXPORT_MESSAGES'
    ? (await estimateMessageCount(account.slug, accountId, source, contentFilter, dateFrom, dateTo)).count
    : 1;

  const job = await jobRunner.createJob({
    type: operation, accountId,
    // Store the resolved id/username so the worker doesn't depend on the free-text the user typed
    // (an id only works when the chat is in the DB; otherwise keep what the user typed, e.g. an invite link)
    sourceChatRaw: sourceInfo.username ? `@${sourceInfo.username}` : srcDbChat ? sourceInfo.telegramId : source,
    destinationChatRaw: destInfo ? (destInfo.username ? `@${destInfo.username}` : dstDbChat ? destInfo.telegramId : destination) : undefined,
    sourceChatId: srcDbChat?.id, destinationChatId: dstDbChat?.id,
    contentFilter, dateFrom, dateTo,
    formatOption: operation === 'EXPORT_MESSAGES' ? format : undefined,
    deletionMode: operation === 'DELETE_MESSAGES' ? deletionMode : undefined,
    totalItems: estimate,
    options: needsDest && dropAuthor ? { dropAuthor: true } : undefined,
  });

  await createLog({
    action: LOG_ACTION[operation], accountId, sourceChat: sourceInfo.title || source, destChat: destInfo?.title || destination || undefined,
    details: `Queued job #${job.id}: ${operation}`, ipAddress: clientIp(request),
  });

  return NextResponse.json({ success: true, data: { jobId: job.id } });
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err) {
    // e.g. account not logged in, Telegram unreachable — surface the reason instead of a bare 500
    return NextResponse.json({ success: false, error: String((err as Error)?.message || err) }, { status: 500 });
  }
}
