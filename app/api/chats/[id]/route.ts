import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAccount } from '@/lib/session';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const { id: paramId } = await params;

  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const chat = await prisma.chat.findFirst({ where: { id: parseInt(paramId, 10), accountId }, include: { statistics: true } });
  if (!chat) return NextResponse.json({ success: false, error: 'Chat not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: chat });
}
