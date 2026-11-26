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
  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
  const status = searchParams.get('status') || '';
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { accountId };
  if (status) where.status = status.toUpperCase();

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      include: {
        sourceChat: { select: { title: true, username: true } },
        destChat: { select: { title: true, username: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.job.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: jobs, total, page, limit, totalPages: Math.ceil(total / limit) });
}
