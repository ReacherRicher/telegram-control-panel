import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAccount, parseDateFrom, parseDateTo } from '@/lib/session';
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
  const search = searchParams.get('search') || '';
  const type = searchParams.get('type') || '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const chatId = searchParams.get('chatId');
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { chat: { accountId } };
  if (chatId) where.chatId = parseInt(chatId, 10);
  if (type) where.messageType = type.toUpperCase();
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = parseDateFrom(dateFrom)!;
    if (dateTo) dateFilter.lte = parseDateTo(dateTo)!;
    where.date = dateFilter;
  }
  if (search) where.text = { contains: search };
  if (searchParams.get('hasMedia') === 'true') where.hasMedia = true;
  if (searchParams.get('hasLinks') === 'true') where.hasLinks = true;

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        chat: { select: { title: true, username: true } },
        sender: { select: { firstName: true, lastName: true, username: true } },
        media: true,
        links: { take: 5 },
      },
    }),
    prisma.message.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: messages, total, page, limit, totalPages: Math.ceil(total / limit) });
}
