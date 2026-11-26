import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getSession } from '@/lib/session';
import prisma from '@/lib/prisma';

// POST — set this account as the active one in the session
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const { id: paramId } = await params;

  const id = parseInt(paramId, 10);
  const account = await prisma.account.findFirst({ where: { id, isActive: true } });
  if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

  const session = await getSession();
  session.activeAccountId = id;
  await session.save();

  return NextResponse.json({ success: true, data: { activeAccountId: id, slug: account.slug, label: account.label } });
}
