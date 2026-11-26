import { NextRequest, NextResponse } from 'next/server';
import prisma from './prisma';
import { requireAccount } from './session';

/** Resolve the active (or ?accountId=) account for an API route, or return an error response. */
export async function activeAccount(request: NextRequest): Promise<{ id: number; slug: string; label: string } | NextResponse> {
  const r = await requireAccount(request);
  if (r instanceof NextResponse) return r;
  const account = await prisma.account.findFirst({ where: { id: r.accountId, isActive: true }, select: { id: true, slug: true, label: true } });
  if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
  return account;
}

export function fail(err: unknown, status = 500) {
  const error = typeof err === 'string' ? err : String((err as Error)?.message || err);
  return NextResponse.json({ success: false, error }, { status });
}
