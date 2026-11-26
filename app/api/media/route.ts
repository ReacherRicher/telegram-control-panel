import { NextRequest, NextResponse } from 'next/server';
import { requireAccount } from '@/lib/session';
import prisma from '@/lib/prisma';

// Media index (the Media page used to read /api/messages, which returned text messages too
// and never knew whether a file had been downloaded)
export async function GET(request: NextRequest) {
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 250);
  const type = searchParams.get('type') || '';
  const chatId = searchParams.get('chatId');
  const downloaded = searchParams.get('downloaded');
  const search = searchParams.get('search') || '';

  const where: Record<string, unknown> = { chat: { accountId } };
  if (type) where.mediaType = type.toUpperCase();
  if (chatId) where.chatId = parseInt(chatId, 10);
  if (downloaded === 'true') where.downloaded = true;
  if (downloaded === 'false') where.downloaded = false;
  if (search) where.fileName = { contains: search };

  const [items, total, sizeAgg] = await Promise.all([
    prisma.media.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: { id: 'desc' },
      include: {
        chat: { select: { id: true, title: true, username: true } },
        message: { select: { date: true, text: true } },
      },
    }),
    prisma.media.count({ where }),
    prisma.media.aggregate({ where, _sum: { fileSize: true } }),
  ]);

  return NextResponse.json({
    success: true,
    data: items.map(({ localPath, ...m }) => ({ ...m, hasFile: !!localPath })),
    total, page, limit, totalPages: Math.ceil(total / limit),
    totalSize: sizeAgg._sum.fileSize || 0,
  });
}
