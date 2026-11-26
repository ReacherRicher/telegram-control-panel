import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { requireAccount } from '@/lib/session';
import prisma from '@/lib/prisma';
import { DOWNLOADS_DIR } from '@/server/telegram/download';

// Serve a downloaded media file (only files inside storage/downloads, only for the active account)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { id } = await params;

  const media = await prisma.media.findFirst({ where: { id: parseInt(id, 10), chat: { accountId: accountResult.accountId } } });
  if (!media?.localPath) return NextResponse.json({ success: false, error: 'File not downloaded' }, { status: 404 });

  const resolved = path.resolve(media.localPath);
  if (!resolved.startsWith(DOWNLOADS_DIR + path.sep)) return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 403 });
  if (!fs.existsSync(resolved)) return NextResponse.json({ success: false, error: 'File missing on disk' }, { status: 404 });

  const stat = fs.statSync(resolved);
  const fileName = path.basename(resolved);
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  const stream = Readable.toWeb(fs.createReadStream(resolved)) as unknown as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      'Content-Type': media.mimeType || 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
