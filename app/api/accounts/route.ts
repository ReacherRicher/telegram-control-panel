import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getSession } from '@/lib/session';
import prisma from '@/lib/prisma';
import { isSessionSaved } from '@/server/telegram/client';

// GET — list accounts (removed accounts are hidden)
export async function GET(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { chats: true, contacts: true, jobs: true } } },
  });

  const session = await getSession();
  const data = accounts.map(({ sessionFile: _sessionFile, ...acc }) => ({
    ...acc,
    sessionExists: isSessionSaved(acc.slug),
    // NOTE: `isActive` used to be overwritten with "is selected", which hid the real DB flag
    isSelected: session.activeAccountId === acc.id,
  }));

  return NextResponse.json({ success: true, data });
}
