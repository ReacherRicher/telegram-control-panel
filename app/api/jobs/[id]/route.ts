import { NextRequest, NextResponse } from 'next/server';
import { requireAccount } from '@/lib/session';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params;
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const job = await prisma.job.findFirst({
    where: { id: parseInt(paramId, 10), accountId },
    include: {
      sourceChat: { select: { id: true, title: true, username: true } },
      destChat: { select: { id: true, title: true, username: true } },
      items: { where: { status: { in: ['FAILED', 'SKIPPED'] } }, take: 200, orderBy: { id: 'desc' } },
      _count: { select: { items: true } },
    },
  });
  if (!job) return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: job });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params;
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const jobId = parseInt(paramId, 10);
  const { action } = await request.json().catch(() => ({}));

  const job = await prisma.job.findFirst({ where: { id: jobId, accountId } });
  if (!job) return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  const fail = (error: string) => NextResponse.json({ success: false, error }, { status: 400 });

  switch (action) {
    case 'pause':
      if (job.status !== 'RUNNING') return fail('Job is not running');
      await prisma.job.update({ where: { id: jobId }, data: { status: 'PAUSED' } });
      break;
    case 'resume':
      // The worker either continues the paused loop, or (after a restart) picks the job up as an orphan
      if (job.status !== 'PAUSED') return fail('Job is not paused');
      await prisma.job.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
      break;
    case 'cancel':
      if (!['QUEUED', 'RUNNING', 'PAUSED'].includes(job.status)) return fail('Only queued, running or paused jobs can be cancelled');
      await prisma.job.update({ where: { id: jobId }, data: { status: 'CANCELLED', completedAt: new Date() } });
      break;
    case 'retry':
      if (!['FAILED', 'CANCELLED'].includes(job.status)) return fail('Only failed or cancelled jobs can be retried');
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'QUEUED', error: null, note: null, completedAt: null, startedAt: null,
          // Exports are rebuilt from scratch; other jobs continue from their checkpoint
          ...(job.type === 'EXPORT_MESSAGES' ? { checkpoint: null, processedItems: 0, failedItems: 0 } : {}),
        },
      });
      break;
    default:
      return fail(`Unknown action: ${action}`);
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params;
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const jobId = parseInt(paramId, 10);
  const job = await prisma.job.findFirst({ where: { id: jobId, accountId } });
  if (!job) return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  if (['QUEUED', 'RUNNING', 'PAUSED'].includes(job.status)) {
    return NextResponse.json({ success: false, error: 'Cancel the job before deleting it' }, { status: 400 });
  }
  await prisma.jobItem.deleteMany({ where: { jobId } });
  await prisma.job.delete({ where: { id: jobId } });
  return NextResponse.json({ success: true });
}
