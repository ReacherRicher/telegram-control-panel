import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getSession } from '@/lib/session';
import prisma from '@/lib/prisma';
import { getWorkerStatus } from '@/server/jobs/worker-loop';

// Lightweight status for the sidebar: selected account, worker heartbeat, active job count.
// Does NOT touch Telegram, so it is cheap to poll.
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const session = await getSession();
  const [accounts, worker, activeJobs] = await Promise.all([
    prisma.account.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true, slug: true, username: true, firstName: true } }),
    getWorkerStatus(),
    session.activeAccountId
      ? prisma.job.count({ where: { accountId: session.activeAccountId, status: { in: ['QUEUED', 'RUNNING', 'PAUSED'] } } })
      : Promise.resolve(0),
  ]);

  const activeAccount = accounts.find((a) => a.id === session.activeAccountId) || null;
  return NextResponse.json({
    success: true,
    data: {
      username: session.username,
      activeAccount,
      accounts,
      worker: { ...worker, embedded: process.env.EMBEDDED_WORKER === 'true' },
      activeJobs,
    },
  });
}
