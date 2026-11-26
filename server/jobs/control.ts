import prisma from '../../lib/prisma';
import { sleep } from '../../lib/utils';

/**
 * Cooperative pause / cancel for long-running jobs.
 *
 * Call `await shouldStop(jobId)` between batches:
 *  - while the job is PAUSED it blocks (polling every 3s)
 *  - returns true if the job was CANCELLED (or deleted) — caller should stop
 *  - returns false when the job should continue
 */
export async function shouldStop(jobId: number | undefined): Promise<boolean> {
  if (!jobId) return false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job || job.status === 'CANCELLED') return true;
    if (job.status !== 'PAUSED') return false;
    await sleep(3000);
  }
}

/** Counts already recorded by a previous run of this job (used when resuming from a checkpoint). */
export async function baseCounts(jobId: number | undefined, resuming: boolean): Promise<{ processed: number; failed: number }> {
  if (!jobId || !resuming) return { processed: 0, failed: 0 };
  const j = await prisma.job.findUnique({ where: { id: jobId }, select: { processedItems: true, failedItems: true } });
  return { processed: j?.processedItems || 0, failed: j?.failedItems || 0 };
}

/**
 * Throttled progress writer — avoids one DB write per message on big jobs.
 * Counts passed in are for the current run; `base` (from a previous run) is added automatically.
 */
export function progressWriter(jobId: number | undefined, base = { processed: 0, failed: 0 }, intervalMs = 1500) {
  let last = 0;
  return async (data: { processedItems?: number; failedItems?: number; totalItems?: number; checkpoint?: string }, force = false) => {
    if (!jobId) return;
    const now = Date.now();
    if (!force && now - last < intervalMs) return;
    last = now;
    await prisma.job.update({
      where: { id: jobId },
      data: {
        ...data,
        ...(data.processedItems !== undefined ? { processedItems: base.processed + data.processedItems } : {}),
        ...(data.failedItems !== undefined ? { failedItems: base.failed + data.failedItems } : {}),
      },
    });
  };
}
