import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAccount, parseDateFrom, parseDateTo } from '@/lib/session';
import prisma from '@/lib/prisma';
import { jobRunner } from '@/server/jobs/runner';
import { createLog } from '@/server/services/log';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const { id: paramId } = await params;

  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const chat = await prisma.chat.findFirst({ where: { id: parseInt(paramId, 10), accountId } });
  if (!chat) return NextResponse.json({ success: false, error: 'Chat not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const job = await jobRunner.createJob({
    type: 'INDEX_MESSAGES', accountId, sourceChatRaw: chat.telegramId, sourceChatId: chat.id,
    dateFrom: parseDateFrom(body.dateFrom),
    dateTo: parseDateTo(body.dateTo),
  });

  await createLog({ action: 'INDEX', accountId, details: `Indexing: ${chat.title}`, sourceChat: chat.username || chat.telegramId });

  return NextResponse.json({ success: true, data: { jobId: job.id } });
}
