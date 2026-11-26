#!/usr/bin/env ts-node
// Background worker: picks up QUEUED jobs and runs them.
// Usage: npm run worker   (or let PM2 run it as tcp-worker)
// Alternative for single-process setups: set EMBEDDED_WORKER=true and don't run this script.

import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { startWorkerLoop } from '../server/jobs/worker-loop';
import { disconnectAll } from '../server/telegram/client';

if (process.env.EMBEDDED_WORKER === 'true') {
  console.error('EMBEDDED_WORKER=true — the web server already runs jobs. Do not start a separate worker (jobs would run twice).');
  process.exit(1);
}

console.log('Worker running. Press Ctrl+C to stop.');
startWorkerLoop();

async function shutdown(signal: string) {
  logger.info(`Worker shutting down (${signal})...`);
  // RUNNING jobs are left as-is; the next worker start picks them up from their checkpoint.
  try { await disconnectAll(); } catch { /* ignore */ }
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
