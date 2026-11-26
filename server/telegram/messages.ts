import { getClientForAccount } from './client';
import { resolvePeer } from './peer';
import { Api } from 'telegram';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import { extractUrls, extractDomain } from '../../lib/utils';
import { shouldStop, progressWriter, baseCounts } from '../jobs/control';
import type { ContentFilter } from '../../types';

/** Classify a message into one of our MessageType values. Shared by index/forward/download/export. */
export function detectMessageType(message: Api.Message): string {
  if (!message.media) return 'TEXT';
  if (message.media instanceof Api.MessageMediaPhoto) return 'PHOTO';
  if (message.media instanceof Api.MessageMediaDocument) {
    const doc = message.media.document;
    if (doc instanceof Api.Document) {
      // Sticker / animated take priority over generic video attributes
      let type = 'DOCUMENT';
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeSticker) return 'STICKER';
        if (attr instanceof Api.DocumentAttributeAnimated) return 'GIF';
        if (attr instanceof Api.DocumentAttributeAudio) type = attr.voice ? 'VOICE' : 'AUDIO';
        if (attr instanceof Api.DocumentAttributeVideo && type === 'DOCUMENT') type = 'VIDEO';
      }
      return type;
    }
    return 'DOCUMENT';
  }
  if (
    message.media instanceof Api.MessageMediaGeo ||
    message.media instanceof Api.MessageMediaGeoLive ||
    message.media instanceof Api.MessageMediaVenue
  ) return 'LOCATION';
  if (message.media instanceof Api.MessageMediaContact) return 'CONTACT';
  if (message.media instanceof Api.MessageMediaPoll) return 'POLL';
  if (message.media instanceof Api.MessageMediaWebPage) return 'TEXT';
  return 'OTHER';
}

export function getMediaMeta(message: Api.Message): { fileName?: string; mimeType?: string; fileSize?: number; telegramFileId?: string } {
  if (!message.media) return {};
  if (message.media instanceof Api.MessageMediaDocument) {
    const doc = message.media.document;
    if (doc instanceof Api.Document) {
      let fileName: string | undefined;
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeFilename) { fileName = attr.fileName; break; }
      }
      return { fileName, mimeType: doc.mimeType, fileSize: Number(doc.size), telegramFileId: String(doc.id) };
    }
  }
  if (message.media instanceof Api.MessageMediaPhoto) {
    const photo = message.media.photo;
    if (photo instanceof Api.Photo) return { telegramFileId: String(photo.id), mimeType: 'image/jpeg' };
  }
  return {};
}

export function messageHasLinks(message: Api.Message): boolean {
  if (extractUrls(message.message || '').length > 0) return true;
  if (message.media instanceof Api.MessageMediaWebPage) return true;
  return (message.entities || []).some((e) => e instanceof Api.MessageEntityUrl || e instanceof Api.MessageEntityTextUrl);
}

const FILTER_MAP: Record<string, string[]> = {
  PHOTOS: ['PHOTO'], VIDEOS: ['VIDEO'], DOCUMENTS: ['DOCUMENT'], AUDIO: ['AUDIO'],
  VOICE: ['VOICE'], GIFS: ['GIF', 'ANIMATION'], STICKERS: ['STICKER'], TEXT: ['TEXT'],
};

/** Type list for DB queries (undefined = no type restriction). LINKS is handled via hasLinks. */
export function filterToTypes(filter: ContentFilter): string[] | undefined {
  return FILTER_MAP[filter];
}

export function messageMatchesFilter(msg: Api.Message, filter: ContentFilter): boolean {
  if (!filter || filter === 'ALL') return true;
  if (filter === 'LINKS') return messageHasLinks(msg);
  return FILTER_MAP[filter]?.includes(detectMessageType(msg)) || false;
}

export function inDateRange(msg: Api.Message, dateFrom?: Date, dateTo?: Date): boolean {
  const d = msg.date * 1000;
  if (dateFrom && d < dateFrom.getTime()) return false;
  if (dateTo && d > dateTo.getTime()) return false;
  return true;
}

/** Collect URLs from visible text and from hidden text-url entities. */
function collectUrls(msg: Api.Message): string[] {
  const urls = new Set(extractUrls(msg.message || ''));
  for (const e of msg.entities || []) {
    if (e instanceof Api.MessageEntityTextUrl && /^https?:\/\//i.test(e.url)) urls.add(e.url);
  }
  return Array.from(urls);
}

export interface IndexOptions {
  slug: string;
  accountId: number;
  chatId: number;
  telegramChatId: string;
  jobId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  /** Resume point: smallest message id already processed (iteration is newest → oldest). */
  checkpoint?: number;
}

export async function indexChatMessages(opts: IndexOptions): Promise<{ indexed: number; failed: number }> {
  const client = await getClientForAccount(opts.slug);
  const { peer } = await resolvePeer(client, opts.accountId, opts.telegramChatId);
  const progress = progressWriter(opts.jobId, await baseCounts(opts.jobId, !!opts.checkpoint));

  let indexed = 0, failed = 0, sinceCheck = 0;
  const senderCache = new Map<string, number>();

  const iter = client.iterMessages(peer, {
    maxId: opts.checkpoint || 0,
    offsetDate: opts.dateTo ? Math.floor(opts.dateTo.getTime() / 1000) : undefined,
    waitTime: 1,
  });

  for await (const msg of iter) {
    if (!(msg instanceof Api.Message)) continue;
    if (opts.dateFrom && msg.date * 1000 < opts.dateFrom.getTime()) break; // older than range → done
    if (!inDateRange(msg, opts.dateFrom, opts.dateTo)) continue;

    if (++sinceCheck >= 100) {
      sinceCheck = 0;
      if (await shouldStop(opts.jobId)) break;
    }

    try {
      const msgDate = new Date(msg.date * 1000);
      const msgType = detectMessageType(msg);
      const mediaMeta = getMediaMeta(msg);
      const text = msg.message || '';
      const urls = collectUrls(msg);

      // Sender (scoped to account) — store real names when GramJS resolved the sender entity
      let senderDbId: number | undefined;
      const senderPeer = msg.fromId instanceof Api.PeerUser ? msg.fromId
        : (!msg.fromId && msg.peerId instanceof Api.PeerUser && !msg.out ? msg.peerId : undefined);
      if (senderPeer) {
        const senderId = String(senderPeer.userId);
        senderDbId = senderCache.get(senderId);
        if (!senderDbId) {
          const s = (msg as unknown as { sender?: unknown }).sender;
          const u = s instanceof Api.User ? s : undefined;
          const user = await prisma.user.upsert({
            where: { accountId_telegramId: { accountId: opts.accountId, telegramId: senderId } },
            update: u ? { firstName: u.firstName || '', lastName: u.lastName || null, username: u.username || null, isBot: !!u.bot } : {},
            create: {
              accountId: opts.accountId, telegramId: senderId,
              firstName: u?.firstName || 'Unknown', lastName: u?.lastName || undefined,
              username: u?.username || undefined, isBot: !!u?.bot,
              accessHash: u?.accessHash ? String(u.accessHash) : undefined,
            },
          });
          senderDbId = user.id;
          senderCache.set(senderId, user.id);
        }
      }

      const fwdFrom = msg.fwdFrom?.fromId;
      const fwdId = fwdFrom instanceof Api.PeerChannel ? fwdFrom.channelId
        : fwdFrom instanceof Api.PeerUser ? fwdFrom.userId
        : fwdFrom instanceof Api.PeerChat ? fwdFrom.chatId : undefined;

      const dbMessage = await prisma.message.upsert({
        where: { telegramMessageId_chatId: { telegramMessageId: msg.id, chatId: opts.chatId } },
        update: { text, messageType: msgType, hasLinks: urls.length > 0 },
        create: {
          telegramMessageId: msg.id, chatId: opts.chatId, senderUserId: senderDbId,
          date: msgDate, text, messageType: msgType, hasMedia: !!msg.media && msgType !== 'TEXT',
          hasLinks: urls.length > 0, mediaType: msg.media && msgType !== 'TEXT' ? msgType : null,
          fileName: mediaMeta.fileName, mimeType: mediaMeta.mimeType, fileSize: mediaMeta.fileSize,
          replyToMessageId: msg.replyTo?.replyToMsgId,
          forwardFromChatId: fwdId !== undefined ? String(fwdId) : undefined,
          forwardFromMsgId: msg.fwdFrom?.channelPost,
          forwardFromName: msg.fwdFrom?.fromName,
        },
      });

      if (msg.media && msgType !== 'TEXT') {
        await prisma.media.upsert({
          where: { messageId: dbMessage.id },
          update: {},
          create: {
            messageId: dbMessage.id, chatId: opts.chatId, telegramMessageId: msg.id,
            mediaType: msgType, fileName: mediaMeta.fileName, mimeType: mediaMeta.mimeType,
            fileSize: mediaMeta.fileSize, telegramFileId: mediaMeta.telegramFileId,
          },
        });
      }

      if (urls.length > 0) {
        // Replace instead of append — re-indexing used to duplicate every link
        await prisma.messageLink.deleteMany({ where: { messageId: dbMessage.id } });
        await prisma.messageLink.createMany({
          data: urls.map((url) => ({ messageId: dbMessage.id, url, domain: extractDomain(url) || undefined })),
        });
      }

      indexed++;
      await progress({ processedItems: indexed, failedItems: failed, checkpoint: String(msg.id) });
    } catch (err) {
      logger.error('Error indexing message', { msgId: msg.id, error: String((err as Error)?.message || err) });
      failed++;
    }
  }

  await progress({ processedItems: indexed, failedItems: failed }, true);
  await updateChatStatistics(opts.chatId);
  return { indexed, failed };
}

export async function updateChatStatistics(chatId: number) {
  const [stats, total, firstMsg, lastMsg, linkCount] = await Promise.all([
    prisma.message.groupBy({ by: ['messageType'], where: { chatId }, _count: { _all: true } }),
    prisma.message.count({ where: { chatId } }),
    prisma.message.findFirst({ where: { chatId }, orderBy: { date: 'asc' } }),
    prisma.message.findFirst({ where: { chatId }, orderBy: { date: 'desc' } }),
    prisma.messageLink.count({ where: { message: { chatId } } }),
  ]);

  const counts: Record<string, number> = {};
  for (const s of stats) counts[s.messageType] = s._count._all;

  const data = {
    totalMessages: total, photoCount: counts['PHOTO'] || 0, videoCount: counts['VIDEO'] || 0,
    documentCount: counts['DOCUMENT'] || 0, audioCount: counts['AUDIO'] || 0,
    voiceCount: counts['VOICE'] || 0, gifCount: counts['GIF'] || 0,
    stickerCount: counts['STICKER'] || 0, linkCount, locationCount: counts['LOCATION'] || 0,
    firstMessageDate: firstMsg?.date, lastMessageDate: lastMsg?.date,
  };

  await prisma.chatStatistics.upsert({ where: { chatId }, update: data, create: { chatId, ...data } });

  const { totalMessages, ...rest } = data;
  await prisma.chat.update({
    where: { id: chatId },
    data: { messageCount: totalMessages, ...rest, lastIndexedAt: new Date() },
  });
}
