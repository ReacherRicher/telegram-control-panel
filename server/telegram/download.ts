import { Api } from 'telegram';
import * as path from 'path';
import * as fs from 'fs';
import { getClientForAccount } from './client';
import { resolvePeer } from './peer';
import { detectMessageType, getMediaMeta, messageMatchesFilter } from './messages';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import { sleep, sanitizeFilename } from '../../lib/utils';
import { shouldStop, progressWriter, baseCounts } from '../jobs/control';
import type { ContentFilter } from '../../types';

export const DOWNLOADS_DIR = path.join(process.cwd(), 'storage', 'downloads');

export interface DownloadOptions {
  slug: string;
  accountId: number;
  jobId: number;
  sourceChatId: string;
  contentFilter: ContentFilter;
  dateFrom?: Date;
  dateTo?: Date;
  /** Resume point: smallest message id already handled (iteration is newest → oldest). */
  checkpoint?: number;
}

const TYPE_DIRS: Record<string, string> = {
  PHOTO: 'photos', VIDEO: 'videos', DOCUMENT: 'documents', AUDIO: 'audio',
  VOICE: 'voice', GIF: 'gifs', ANIMATION: 'gifs', STICKER: 'stickers',
};

function extensionFor(mediaType: string, mimeType?: string): string {
  if (mediaType === 'PHOTO') return '.jpg';
  const map: Record<string, string> = {
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/x-wav': '.wav',
    'image/webp': '.webp', 'application/x-tgsticker': '.tgs', 'image/jpeg': '.jpg', 'image/png': '.png',
    'application/pdf': '.pdf', 'application/zip': '.zip',
  };
  return (mimeType && map[mimeType]) || '';
}

export async function downloadMedia(opts: DownloadOptions): Promise<{ downloaded: number; failed: number; skipped: number; totalBytes: number }> {
  const client = await getClientForAccount(opts.slug);
  const src = await resolvePeer(client, opts.accountId, opts.sourceChatId);
  const chatDir = path.join(DOWNLOADS_DIR, opts.slug, src.telegramId);
  fs.mkdirSync(chatDir, { recursive: true });

  const dbChat = await prisma.chat.findFirst({ where: { accountId: opts.accountId, telegramId: src.telegramId } });
  const progress = progressWriter(opts.jobId, await baseCounts(opts.jobId, !!opts.checkpoint));

  let downloaded = 0, failed = 0, skipped = 0, totalBytes = 0;

  const iter = client.iterMessages(src.peer, {
    maxId: opts.checkpoint || 0,
    offsetDate: opts.dateTo ? Math.floor(opts.dateTo.getTime() / 1000) : undefined,
    waitTime: 1,
  });

  for await (const msg of iter) {
    if (!(msg instanceof Api.Message) || !msg.media) continue;
    if (opts.dateFrom && msg.date * 1000 < opts.dateFrom.getTime()) break;
    if (opts.dateTo && msg.date * 1000 > opts.dateTo.getTime()) continue;

    const mediaType = detectMessageType(msg);
    if (!TYPE_DIRS[mediaType]) continue; // web previews, polls, locations … have nothing to download
    if (!messageMatchesFilter(msg, opts.contentFilter)) continue;
    if (await shouldStop(opts.jobId)) break;

    const meta = getMediaMeta(msg);
    const destDir = path.join(chatDir, TYPE_DIRS[mediaType]);
    fs.mkdirSync(destDir, { recursive: true });

    // Prefix with message id: many files share names like "image.jpg" and used to overwrite / be skipped.
    const baseName = meta.fileName ? sanitizeFilename(meta.fileName) : `${mediaType.toLowerCase()}${extensionFor(mediaType, meta.mimeType)}`;
    const destPath = path.join(destDir, `${msg.id}_${baseName}`);

    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      skipped++;
    } else {
      const tmpPath = destPath + '.part';
      try {
        await client.downloadMedia(msg, { outputFile: tmpPath });
        fs.renameSync(tmpPath, destPath);
        const size = fs.statSync(destPath).size;
        totalBytes += size;
        if (dbChat) {
          await prisma.media.updateMany({
            where: { chatId: dbChat.id, telegramMessageId: msg.id },
            data: { downloaded: true, localPath: destPath },
          });
        }
        await prisma.jobItem.create({ data: { jobId: opts.jobId, telegramMessageId: msg.id, status: 'SUCCESS', processedAt: new Date() } });
        downloaded++;
      } catch (err: unknown) {
        try { fs.rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
        const errMsg = String((err as Error)?.message || err);
        logger.error('Download error', { msgId: msg.id, error: errMsg });
        await prisma.jobItem.create({ data: { jobId: opts.jobId, telegramMessageId: msg.id, status: 'FAILED', error: errMsg, processedAt: new Date() } });
        failed++;
      }
      await sleep(300);
    }

    await progress({ processedItems: downloaded + skipped, failedItems: failed, checkpoint: String(msg.id) });
  }

  await progress({ processedItems: downloaded + skipped, failedItems: failed }, true);
  return { downloaded, failed, skipped, totalBytes };
}
