import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import type { LogAction } from '../../types';

export async function createLog(params: {
  action: LogAction;
  accountId?: number;
  details?: string;
  sourceChat?: string;
  destChat?: string;
  itemCount?: number;
  successCount?: number;
  failCount?: number;
  ipAddress?: string;
}) {
  try {
    await prisma.systemLog.create({ data: params });
  } catch (err) {
    logger.error('Failed to write system log', { error: err });
  }
}
