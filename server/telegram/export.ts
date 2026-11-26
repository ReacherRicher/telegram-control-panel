import { Api } from 'telegram';
import * as fs from 'fs';
import * as path from 'path';
import { getClientForAccount } from './client';
import { resolvePeer } from './peer';
import { detectMessageType, getMediaMeta, messageMatchesFilter } from './messages';
import logger from '../../lib/logger';
import { shouldStop, progressWriter } from '../jobs/control';
import type { ContentFilter, ExportFormat } from '../../types';

export const EXPORT_DIR = path.join(process.cwd(), 'storage', 'exports');

export interface ExportOptions {
  slug: string;
  accountId: number;
  jobId: number;
  sourceChatId: string;
  contentFilter: ContentFilter;
  format: ExportFormat;
  dateFrom?: Date;
  dateTo?: Date;
}

interface MessageRecord {
  id: number; date: string; senderId: string; sender: string; type: string; text: string;
  hasMedia: boolean; mediaType: string | null; fileName: string | null;
  replyTo: number | null; forwardFrom: string | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Export always starts from scratch (records are built in memory, so a "resume" would
 * silently produce a partial file). Output is chronological (oldest first).
 */
export async function exportMessages(opts: ExportOptions): Promise<{ exported: number; outputPath: string; cancelled: boolean }> {
  const client = await getClientForAccount(opts.slug);
  const src = await resolvePeer(client, opts.accountId, opts.sourceChatId);
  const progress = progressWriter(opts.jobId);

  const jobDir = path.join(EXPORT_DIR, `job-${opts.jobId}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const safeTitle = (src.username || src.title || src.telegramId).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'chat';
  const outputFile = path.join(jobDir, `${safeTitle}.${opts.format.toLowerCase()}`);

  const records: MessageRecord[] = [];
  let cancelled = false, scanned = 0;

  const iter = client.iterMessages(src.peer, {
    offsetDate: opts.dateTo ? Math.floor(opts.dateTo.getTime() / 1000) : undefined,
    waitTime: 1,
  });

  for await (const msg of iter) {
    if (!(msg instanceof Api.Message)) continue;
    if (opts.dateFrom && msg.date * 1000 < opts.dateFrom.getTime()) break;
    if (opts.dateTo && msg.date * 1000 > opts.dateTo.getTime()) continue;
    if (++scanned % 200 === 0 && (await shouldStop(opts.jobId))) { cancelled = true; break; }
    if (!messageMatchesFilter(msg, opts.contentFilter)) continue;

    const type = detectMessageType(msg);
    const meta = getMediaMeta(msg);
    const sender = (msg as unknown as { sender?: unknown }).sender;
    const senderName = sender instanceof Api.User
      ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || ''
      : sender instanceof Api.Channel || sender instanceof Api.Chat ? sender.title : '';
    const senderId = msg.fromId instanceof Api.PeerUser ? String(msg.fromId.userId)
      : msg.fromId instanceof Api.PeerChannel ? String(msg.fromId.channelId)
      : msg.out ? 'me' : src.telegramId;

    records.push({
      id: msg.id, date: new Date(msg.date * 1000).toISOString(),
      senderId, sender: senderName || senderId, type, text: msg.message || '',
      hasMedia: type !== 'TEXT', mediaType: type !== 'TEXT' ? type : null, fileName: meta.fileName || null,
      replyTo: msg.replyTo?.replyToMsgId || null, forwardFrom: msg.fwdFrom?.fromName || null,
    });
    await progress({ processedItems: records.length });
  }

  if (cancelled) return { exported: records.length, outputPath: '', cancelled: true };

  records.reverse(); // chronological

  switch (opts.format) {
    case 'JSON':
      fs.writeFileSync(outputFile, JSON.stringify({ chat: { id: src.telegramId, title: src.title, username: src.username }, messages: records }, null, 2), 'utf-8');
      break;
    case 'CSV': {
      const header = ['id', 'date', 'senderId', 'sender', 'type', 'text', 'mediaType', 'fileName', 'replyTo', 'forwardFrom'];
      const rows = records.map((r) => [r.id, r.date, r.senderId, r.sender, r.type, r.text, r.mediaType, r.fileName, r.replyTo, r.forwardFrom].map(csvCell).join(','));
      // BOM so Excel shows Persian / non-Latin text correctly
      fs.writeFileSync(outputFile, String.fromCharCode(0xfeff) + header.join(',') + '\r\n' + rows.join('\r\n'), 'utf-8');
      break;
    }
    case 'TXT':
      fs.writeFileSync(outputFile, records.map((r) =>
        `[${r.date.replace('T', ' ').slice(0, 19)}] ${r.sender}: ${r.text || (r.mediaType ? `[${r.mediaType}${r.fileName ? ` ${r.fileName}` : ''}]` : '')}`
      ).join('\n'), 'utf-8');
      break;
    case 'HTML': {
      const rows = records.map((r) => `
<div class="msg" id="m${r.id}">
  <div class="meta"><span class="sender">${esc(r.sender)}</span><span class="date">${esc(r.date.replace('T', ' ').slice(0, 16))}</span></div>
  ${r.mediaType ? `<div class="media">[${esc(r.mediaType)}${r.fileName ? ` · ${esc(r.fileName)}` : ''}]</div>` : ''}
  ${r.text ? `<div class="text" dir="auto">${esc(r.text).replace(/\n/g, '<br>')}</div>` : ''}
</div>`).join('');
      fs.writeFileSync(outputFile, `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(src.title)}</title>
<style>
body{font-family:-apple-system,"Segoe UI",Tahoma,sans-serif;background:#f4f4f5;margin:0;padding:24px}
.wrap{max-width:760px;margin:0 auto}h1{font-size:20px}.sub{color:#71717a;font-size:13px;margin-bottom:16px}
.msg{background:#fff;border-radius:10px;padding:10px 14px;margin:8px 0;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.meta{display:flex;justify-content:space-between;font-size:12px;color:#71717a;margin-bottom:4px}.sender{font-weight:600;color:#2563eb}
.media{font-size:12px;color:#7c3aed}.text{white-space:normal;line-height:1.6;font-size:14px}
</style></head><body><div class="wrap"><h1>${esc(src.title)}</h1><div class="sub">${records.length} messages · exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</div>${rows}</div></body></html>`, 'utf-8');
      break;
    }
  }

  await progress({ processedItems: records.length, totalItems: records.length }, true);
  logger.info(`Export complete: ${records.length} messages → ${outputFile}`);
  return { exported: records.length, outputPath: outputFile, cancelled: false };
}
