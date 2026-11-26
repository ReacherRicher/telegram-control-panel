import { NextRequest, NextResponse } from 'next/server';
import { requireAccount } from '@/lib/session';
import { EXPORT_DIR } from '@/server/telegram/export';
import prisma from '@/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { jobId } = await params;

  const job = await prisma.job.findFirst({ where: { id: parseInt(jobId, 10), accountId: accountResult.accountId } });
  if (!job || job.type !== 'EXPORT_MESSAGES') {
    return NextResponse.json({ success: false, error: 'Export job not found' }, { status: 404 });
  }
  if (job.status !== 'COMPLETED' || !job.outputPath) {
    return NextResponse.json({ success: false, error: 'Export not ready' }, { status: 400 });
  }

  // Security: ensure path is within storage/exports
  const resolved = path.resolve(job.outputPath);
  if (!resolved.startsWith(EXPORT_DIR + path.sep)) {
    return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);
  const fileName = path.basename(resolved);
  const asciiName = fileName.replace(/[^ -~]/g, '_').replace(/"/g, '');
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
  };

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
