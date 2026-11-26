import { getClientForAccount } from './client';
import { resolvePeer, parseInviteHash, type ResolvedPeer } from './peer';
import { Api, TelegramClient } from 'telegram';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import type { ChatType } from '../../types';
import { sleep, withRetry } from '../../lib/utils';
import { shouldStop } from '../jobs/control';

type TelegramEntity = Api.User | Api.Chat | Api.Channel;

function classifyEntity(entity: TelegramEntity): ChatType {
  if (entity instanceof Api.User) {
    if (entity.bot) return 'BOT';
    if (entity.self) return 'SAVED_MESSAGES';
    return 'PRIVATE';
  }
  if (entity instanceof Api.Chat) return 'GROUP';
  if (entity instanceof Api.Channel) {
    return entity.megagroup ? 'SUPERGROUP' : 'CHANNEL';
  }
  return 'PRIVATE';
}

export async function syncDialogs(slug: string, accountId: number): Promise<number> {
  const client = await getClientForAccount(slug);
  let count = 0;

  // Use GramJS built-in iterator — handles ALL pagination, all entity types,
  // groups, channels, private chats, bots automatically.
  // iterDialogs fetches in batches and resolves entities correctly.
  try {
    const dialogs = await client.getDialogs({ limit: 0 }); // limit:0 = fetch ALL

    for (const dialog of dialogs) {
      try {
        const entity = dialog.entity as TelegramEntity | undefined;
        if (!entity) continue;

        const type = classifyEntity(entity);
        let telegramId = '', title = '', username: string | undefined;
        let isAdmin = false, isOwner = false, accessHash: string | undefined;
        let membersCount: number | undefined;

        if (entity instanceof Api.User) {
          telegramId = String(entity.id);
          title = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || 'Unknown';
          username = entity.username || undefined;
          accessHash = entity.accessHash ? String(entity.accessHash) : undefined;
        } else if (entity instanceof Api.Chat) {
          telegramId = String(entity.id);
          title = entity.title || '';
          isAdmin = !!((entity as unknown as { adminRights?: unknown }).adminRights);
          isOwner = entity.creator || false;
          membersCount = (entity as unknown as { participantsCount?: number }).participantsCount;
        } else if (entity instanceof Api.Channel) {
          telegramId = String(entity.id);
          title = entity.title || '';
          username = entity.username || undefined;
          accessHash = entity.accessHash ? String(entity.accessHash) : undefined;
          isAdmin = !!entity.adminRights;
          isOwner = entity.creator || false;
          membersCount = (entity as unknown as { participantsCount?: number }).participantsCount;
        }

        if (!telegramId) continue;

        await prisma.chat.upsert({
          where: { accountId_telegramId: { accountId, telegramId } },
          update: {
            title, username, type,
            isPublic: !!username,
            isAdmin, isOwner,
            accessHash,
            membersCount: membersCount ?? undefined,
            publicUrl: username ? `https://t.me/${username}` : undefined,
            updatedAt: new Date(),
          },
          create: {
            accountId, telegramId, title, username, type,
            isPublic: !!username,
            isAdmin, isOwner,
            isMember: true,
            accessHash,
            membersCount: membersCount ?? undefined,
            publicUrl: username ? `https://t.me/${username}` : undefined,
          },
        });
        count++;
      } catch (innerErr: unknown) {
        // Skip single bad entity, don't abort entire sync
        logger.warn(`syncDialogs: skipped one entity`, { error: String((innerErr as Error)?.message || innerErr) });
      }

      // Small delay every 50 to avoid hammering
      if (count % 50 === 0) await sleep(200);
    }
  } catch (err: unknown) {
    const errMsg = String((err as Error)?.message || err);
    logger.error(`syncDialogs failed for ${slug}`, { error: errMsg });
    throw err;
  }

  logger.info(`Synced ${count} dialogs for ${slug}`);
  return count;
}

export async function resolveChat(slug: string, identifier: string, accountId: number) {
  const client = await getClientForAccount(slug);
  try {
    const r = await resolvePeer(client, accountId, identifier);
    return { telegramId: r.telegramId, title: r.title, username: r.username, type: r.type, isChannel: r.isChannel, isAdmin: r.isAdmin };
  } catch (err) {
    logger.warn('resolveChat error', { slug, identifier, error: errText(err) });
    return null;
  }
}

/** Preview an invite link without joining (title + member count). */
export async function previewInvite(slug: string, identifier: string): Promise<{ title: string; membersCount?: number; alreadyMember: boolean } | null> {
  const hash = parseInviteHash(identifier);
  if (!hash) return null;
  const client = await getClientForAccount(slug);
  try {
    const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
    if (invite instanceof Api.ChatInvite) return { title: invite.title, membersCount: invite.participantsCount, alreadyMember: false };
    const chat = (invite as Api.ChatInviteAlready).chat as Api.Chat | Api.Channel;
    return { title: chat.title || '', alreadyMember: true };
  } catch (err) {
    logger.warn('previewInvite failed', { error: errText(err) });
    return null;
  }
}

function errText(err: unknown) { return String((err as Error)?.message || err); }

export async function joinChat(slug: string, identifier: string): Promise<{ success: boolean; error?: string }> {
  const client = await getClientForAccount(slug);
  try {
    const hash = parseInviteHash(identifier);
    if (hash) {
      await client.invoke(new Api.messages.ImportChatInvite({ hash }));
    } else {
      const entity = await client.getEntity(identifier.trim().replace(/^@/, ''));
      if (!(entity instanceof Api.Channel)) {
        return { success: false, error: 'Only public channels/supergroups can be joined by username. Use an invite link for private groups.' };
      }
      await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = errText(err);
    if (msg.includes('USER_ALREADY_PARTICIPANT')) return { success: true };
    if (msg.includes('INVITE_REQUEST_SENT')) return { success: true, error: 'Join request sent — waiting for admin approval.' };
    return { success: false, error: msg };
  }
}

async function leaveResolved(client: TelegramClient, r: ResolvedPeer) {
  if (r.entity instanceof Api.Channel) {
    await client.invoke(new Api.channels.LeaveChannel({ channel: r.entity }));
  } else if (r.entity instanceof Api.Chat) {
    await client.invoke(new Api.messages.DeleteChatUser({ chatId: r.entity.id, userId: new Api.InputUserSelf() }));
  } else {
    throw new Error('Cannot leave a private chat — use "Delete messages" instead');
  }
}

export async function leaveChat(slug: string, accountId: number, identifier: string): Promise<{ success: boolean; error?: string; telegramId?: string }> {
  const client = await getClientForAccount(slug);
  try {
    const r = await resolvePeer(client, accountId, identifier);
    await leaveResolved(client, r);
    return { success: true, telegramId: r.telegramId };
  } catch (err: unknown) {
    return { success: false, error: errText(err) };
  }
}

async function bulkOverChats(
  slug: string,
  accountId: number,
  jobId: number | undefined,
  types: string[],
  onlyMember: boolean,
  action: (client: TelegramClient, r: ResolvedPeer) => Promise<void>,
  afterSuccess?: (chatId: number) => Promise<unknown>,
): Promise<{ ok: number; failed: number }> {
  const client = await getClientForAccount(slug);
  const chats = await prisma.chat.findMany({ where: { accountId, type: { in: types }, ...(onlyMember ? { isMember: true } : {}) } });
  if (jobId) await prisma.job.update({ where: { id: jobId }, data: { totalItems: chats.length } });

  let ok = 0, failed = 0;
  for (const chat of chats) {
    if (await shouldStop(jobId)) break;
    const name = chat.title || chat.username || chat.telegramId;
    try {
      const r = await resolvePeer(client, accountId, chat.telegramId);
      await withRetry(() => action(client, r), 1);
      if (afterSuccess) await afterSuccess(chat.id);
      ok++;
      if (jobId) await prisma.jobItem.create({ data: { jobId, status: 'SUCCESS', error: name, processedAt: new Date() } });
    } catch (err) {
      failed++;
      if (jobId) await prisma.jobItem.create({ data: { jobId, status: 'FAILED', error: `${name}: ${errText(err)}`, processedAt: new Date() } });
    }
    if (jobId) await prisma.job.update({ where: { id: jobId }, data: { processedItems: ok, failedItems: failed } });
    await sleep(800);
  }
  return { ok, failed };
}

const markLeft = (id: number) => prisma.chat.update({ where: { id }, data: { isMember: false } });

export async function leaveAllGroups(slug: string, accountId: number, jobId?: number): Promise<{ left: number; failed: number }> {
  const r = await bulkOverChats(slug, accountId, jobId, ['GROUP', 'SUPERGROUP'], true, leaveResolved, markLeft);
  return { left: r.ok, failed: r.failed };
}

export async function leaveAllChannels(slug: string, accountId: number, jobId?: number): Promise<{ left: number; failed: number }> {
  const r = await bulkOverChats(slug, accountId, jobId, ['CHANNEL'], true, leaveResolved, markLeft);
  return { left: r.ok, failed: r.failed };
}

export async function deleteAllPrivateChats(slug: string, accountId: number, mode: 'FOR_ME' | 'FOR_EVERYONE', jobId?: number): Promise<{ deleted: number; failed: number }> {
  const revoke = mode === 'FOR_EVERYONE';
  const r = await bulkOverChats(slug, accountId, jobId, ['PRIVATE', 'BOT'], false, async (client, peer) => {
    // DeleteHistory removes a chunk per call and returns a non-zero offset while more remains
    for (let i = 0; i < 1000; i++) {
      const res = await client.invoke(new Api.messages.DeleteHistory({ peer: peer.peer, maxId: 0, revoke }));
      if (!res.offset) break;
    }
  });
  return { deleted: r.ok, failed: r.failed };
}

export async function markChatAsRead(slug: string, accountId: number, identifier: string): Promise<{ success: boolean; error?: string }> {
  const client = await getClientForAccount(slug);
  try {
    const r = await resolvePeer(client, accountId, identifier);
    if (r.entity instanceof Api.Channel) {
      await client.invoke(new Api.channels.ReadHistory({ channel: r.entity, maxId: 0 }));
    } else {
      await client.invoke(new Api.messages.ReadHistory({ peer: r.peer, maxId: 0 }));
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: errText(err) };
  }
}
