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
  const search = searchParams.get('search') || '';
  const domain = searchParams.get('domain') || '';
  const chatId = searchParams.get('chatId') || '';
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { message: { chat: { accountId } } };
  if (search) where.url = { contains: search };
  if (domain) where.domain = { contains: domain };
  if (chatId) where.message = { chatId: parseInt(chatId, 10), chat: { accountId } };

  const [links, total] = await Promise.all([
    prisma.messageLink.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        message: { select: { telegramMessageId: true, date: true, chat: { select: { title: true, username: true } } } },
      },
    }),
    prisma.messageLink.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: links, total, page, limit, totalPages: Math.ceil(total / limit) });
}
