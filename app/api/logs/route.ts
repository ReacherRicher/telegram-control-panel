import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAccount } from '@/lib/session';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 250);
  const action = searchParams.get('action') || '';
  const skip = (page - 1) * limit;

  // Include panel-level events (admin login/logout) that have no account
  const where: Record<string, unknown> = { OR: [{ accountId }, { accountId: null }] };
  if (action) where.action = action.toUpperCase();

  const [logs, total] = await Promise.all([
    prisma.systemLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.systemLog.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: logs, total, page, limit, totalPages: Math.ceil(total / limit) });
}
