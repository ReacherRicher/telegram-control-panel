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
  const search = (searchParams.get('search') || '').trim().replace(/^@/, '');
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { accountId };
  // Message senders are stored as users too; show only real contacts unless ?all=true
  if (searchParams.get('all') !== 'true') where.phone = { not: null };
  if (search) {
    where.OR = [
      { firstName: { contains: search } }, { lastName: { contains: search } },
      { username: { contains: search } }, { phone: { contains: search } },
      { telegramId: { contains: search } },
    ];
  }

  const [contacts, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take: limit, orderBy: { firstName: 'asc' } }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: contacts, total, page, limit, totalPages: Math.ceil(total / limit) });
}
