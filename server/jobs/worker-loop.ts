import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import { jobRunner } from './runner';

export const WORKER_HEARTBEAT_KEY = 'worker_heartbeat';
const POLL_INTERVAL = 2000;
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || '3', 10));

/**
 * Picks up jobs and runs them. Must run in exactly ONE process
 * (either `npm run worker` / PM2 tcp-worker, or the web server with EMBEDDED_WORKER=true).
 *
 * - QUEUED jobs are started (max one per account at a time, to stay under Telegram flood limits)
 * - RUNNING jobs not owned by this process are orphans (crash/restart, or a resumed job) and are
 *   restarted from their checkpoint
 */
async function pollOnce() {
  await prisma.setting.upsert({
    where: { key: WORKER_HEARTBEAT_KEY },
    update: { value: new Date().toISOString() },
    create: { key: WORKER_HEARTBEAT_KEY, value: new Date().toISOString() },
  });

  const candidates = await prisma.job.findMany({
    where: { status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, type: true, status: true, accountId: true },
  });

  const mine = new Set(jobRunner.getRunningJobs());
  const busyAccounts = new Set(candidates.filter((j) => mine.has(j.id)).map((j) => j.accountId));

  for (const job of candidates) {
    if (mine.has(job.id)) continue;
    if (mine.size >= MAX_CONCURRENT) break;
    if (busyAccounts.has(job.accountId)) continue;

    logger.info(`${job.status === 'RUNNING' ? 'Resuming' : 'Starting'} job #${job.id} (${job.type})`);
    mine.add(job.id);
    busyAccounts.add(job.accountId);
    jobRunner.runJob(job.id).catch((err) => logger.error(`Unhandled job error #${job.id}`, { error: String(err) }));
  }
}

export function startWorkerLoop() {
  const g = globalThis as unknown as { __tcpWorkerStarted?: boolean };
  if (g.__tcpWorkerStarted) return;
  g.__tcpWorkerStarted = true;

  logger.info(`Worker started (max ${MAX_CONCURRENT} concurrent jobs)`);
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await pollOnce(); } catch (err) { logger.error('Worker poll error', { error: String(err) }); }
    finally { busy = false; }
  };
  tick();
  setInterval(tick, POLL_INTERVAL);
}

/** Last heartbeat from any worker process, or null. */
export async function getWorkerStatus(): Promise<{ online: boolean; lastSeen: string | null }> {
  const s = await prisma.setting.findUnique({ where: { key: WORKER_HEARTBEAT_KEY } });
  const lastSeen = s?.value || null;
  const online = !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 15000;
  return { online, lastSeen };
}
