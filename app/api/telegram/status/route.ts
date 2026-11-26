import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAccount } from '@/lib/session';
import { checkAccountConnection } from '@/server/telegram/client';
import { getAccountInfo } from '@/server/telegram/account';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  try {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

    const connected = await checkAccountConnection(account.slug);
    let liveInfo = null;
    if (connected) liveInfo = await getAccountInfo(account.slug);

    const chatStats = await prisma.chat.groupBy({ by: ['type'], where: { accountId }, _count: { _all: true } });
    const statsByType: Record<string, number> = {};
    for (const s of chatStats) statsByType[s.type] = s._count._all;

    const messageCount = await prisma.message.count({ where: { chat: { accountId } } });
    const mediaStats = await prisma.media.groupBy({ by: ['mediaType'], where: { chat: { accountId } }, _count: { _all: true } });
    const mediaByType: Record<string, number> = {};
    for (const s of mediaStats) mediaByType[s.mediaType] = s._count._all;

    const contactCount = await prisma.user.count({ where: { accountId } });
    const jobStats = await prisma.job.groupBy({ by: ['status'], where: { accountId }, _count: { _all: true } });
    const jobsByStatus: Record<string, number> = {};
    for (const s of jobStats) jobsByStatus[s.status] = s._count._all;

    return NextResponse.json({
      success: true,
      data: {
        account: { ...account, connected, liveInfo },
        stats: {
          contacts: contactCount,
          privateChats: statsByType['PRIVATE'] || 0,
          groups: (statsByType['GROUP'] || 0) + (statsByType['SUPERGROUP'] || 0),
          channels: statsByType['CHANNEL'] || 0,
          bots: statsByType['BOT'] || 0,
          messages: messageCount,
          photos: mediaByType['PHOTO'] || 0,
          videos: mediaByType['VIDEO'] || 0,
          documents: mediaByType['DOCUMENT'] || 0,
        },
        jobs: {
          active: (jobsByStatus['RUNNING'] || 0) + (jobsByStatus['QUEUED'] || 0),
          completed: jobsByStatus['COMPLETED'] || 0,
          failed: jobsByStatus['FAILED'] || 0,
        },
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String((err as Error)?.message || err) }, { status: 500 });
  }
}
