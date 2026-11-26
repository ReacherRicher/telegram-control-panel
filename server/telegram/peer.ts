/**
 * Resolve a user-supplied chat identifier into a usable Telegram entity + InputPeer.
 *
 * Accepts: @username, username, https://t.me/username, invite links (t.me/+hash, t.me/joinchat/hash),
 * "me"/"self", raw numeric IDs as stored in the DB (e.g. 1234567890) and marked IDs (-1001234567890, -123).
 *
 * Numeric IDs are resolved from the DB (Chat / User rows hold the access hash) because a fresh
 * StringSession has no entity cache — calling client.getEntity("123") directly would be treated as a
 * phone number and fail. This is what made operations on private chats / channels without a username fail.
 */
import bigInt from 'big-integer';
import { Api, TelegramClient } from 'telegram';
import type { Entity } from 'telegram/define';
import prisma from '../../lib/prisma';
import type { ChatType } from '../../types';

export interface ResolvedPeer {
  entity: Entity;
  peer: Api.TypeInputPeer;
  telegramId: string;
  title: string;
  username?: string;
  type: ChatType;
  /** Channel or supergroup (uses channels.* methods) */
  isChannel: boolean;
  /** Broadcast channel (not a supergroup) */
  isBroadcast: boolean;
  /** Admin or creator of a group/channel */
  isAdmin: boolean;
}

const INVITE_RE = /(?:t\.me|telegram\.me)\/(?:\+|joinchat\/)([\w-]+)/i;

export function parseInviteHash(raw: string): string | null {
  const m = raw.trim().match(INVITE_RE);
  return m ? m[1] : null;
}

function describe(entity: Entity): Omit<ResolvedPeer, 'entity' | 'peer'> {
  if (entity instanceof Api.User) {
    return {
      telegramId: String(entity.id),
      title: [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || String(entity.id),
      username: entity.username || undefined,
      type: entity.self ? 'SAVED_MESSAGES' : entity.bot ? 'BOT' : 'PRIVATE',
      isChannel: false,
      isBroadcast: false,
      isAdmin: false,
    };
  }
  if (entity instanceof Api.Chat) {
    return {
      telegramId: String(entity.id),
      title: entity.title || '',
      type: 'GROUP',
      isChannel: false,
      isBroadcast: false,
      isAdmin: !!entity.creator || !!entity.adminRights,
    };
  }
  if (entity instanceof Api.Channel) {
    return {
      telegramId: String(entity.id),
      title: entity.title || '',
      username: entity.username || undefined,
      type: entity.megagroup ? 'SUPERGROUP' : 'CHANNEL',
      isChannel: true,
      isBroadcast: !entity.megagroup,
      isAdmin: !!entity.creator || !!entity.adminRights,
    };
  }
  throw new Error('Unsupported chat type (chat may be forbidden or deleted)');
}

function inputPeerFromDb(type: string, telegramId: string, accessHash?: string | null): Api.TypeInputPeer | null {
  const id = bigInt(telegramId);
  const hash = bigInt(accessHash || '0');
  switch (type) {
    case 'SAVED_MESSAGES':
      return new Api.InputPeerSelf();
    case 'PRIVATE':
    case 'BOT':
      return new Api.InputPeerUser({ userId: id, accessHash: hash });
    case 'GROUP':
      return new Api.InputPeerChat({ chatId: id });
    case 'CHANNEL':
    case 'SUPERGROUP':
      return new Api.InputPeerChannel({ channelId: id, accessHash: hash });
    default:
      return null;
  }
}

export async function resolvePeer(client: TelegramClient, accountId: number, raw: string): Promise<ResolvedPeer> {
  const s = (raw || '').trim();
  if (!s) throw new Error('Chat identifier is empty');

  let entity: Entity | undefined;

  if (/^(me|self)$/i.test(s)) {
    entity = (await client.getMe()) as Api.User;
  } else if (/^-?\d+$/.test(s)) {
    // Strip Bot-API style markers: -100xxxx (channel) or -xxxx (basic group)
    const plainId = s.startsWith('-100') ? s.slice(4) : s.startsWith('-') ? s.slice(1) : s;

    const dbChat = await prisma.chat.findFirst({ where: { accountId, telegramId: plainId } });
    if (dbChat) {
      const input = inputPeerFromDb(dbChat.type, dbChat.telegramId, dbChat.accessHash);
      if (input) entity = await client.getEntity(input);
    }
    if (!entity) {
      const contact = await prisma.user.findFirst({ where: { accountId, telegramId: plainId, accessHash: { not: null } } });
      if (contact) entity = await client.getEntity(new Api.InputPeerUser({ userId: bigInt(plainId), accessHash: bigInt(contact.accessHash!) }));
    }
    if (!entity) {
      try {
        entity = await client.getEntity(bigInt(s));
      } catch {
        throw new Error(`Chat ${s} is not known for this account. Run "Sync" first, or use the @username / link.`);
      }
    }
  } else {
    const inviteHash = parseInviteHash(s);
    if (inviteHash) {
      const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash: inviteHash }));
      if (invite instanceof Api.ChatInviteAlready || invite instanceof Api.ChatInvitePeek) {
        entity = invite.chat as Entity;
      } else {
        throw new Error('You are not a member of this private chat yet. Use "Join" first.');
      }
    } else {
      entity = await client.getEntity(s.replace(/^@/, ''));
    }
  }

  const peer = (await client.getInputEntity(entity)) as Api.TypeInputPeer;
  return { entity, peer, ...describe(entity) };
}
