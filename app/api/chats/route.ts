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
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 250);
  const search = (searchParams.get('search') || '').trim().replace(/^@/, '');
  const filter = searchParams.get('filter') || 'all';
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { accountId };
  if (search) {
    where.OR = [{ title: { contains: search } }, { username: { contains: search } }, { telegramId: { contains: search } }];
  }
  switch (filter) {
    case 'private': where.type = 'PRIVATE'; break;
    case 'groups': where.type = { in: ['GROUP', 'SUPERGROUP'] }; break;
    case 'channels': where.type = 'CHANNEL'; break;
    case 'groupsAndChannels': where.type = { in: ['GROUP', 'SUPERGROUP', 'CHANNEL'] }; where.isMember = true; break;
    case 'bots': where.type = 'BOT'; break;
    case 'indexed': where.lastIndexedAt = { not: null }; break;
    case 'admin': where.isAdmin = true; break;
    case 'owner': where.isOwner = true; break;
  }

  const [chats, total] = await Promise.all([
    prisma.chat.findMany({ where, skip, take: limit, orderBy: { title: 'asc' }, include: { statistics: true } }),
    prisma.chat.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: chats, total, page, limit, totalPages: Math.ceil(total / limit) });
}
