import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAccount } from '@/lib/session';
import { syncContacts } from '@/server/telegram/contacts';
import { syncDialogs } from '@/server/telegram/dialogs';
import { syncAccountInfoToDb } from '@/server/telegram/account';
import { createLog } from '@/server/services/log';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

  try {
    await syncAccountInfoToDb(account.slug);
    const contactCount = await syncContacts(account.slug, accountId);
    const dialogCount = await syncDialogs(account.slug, accountId);
    await createLog({ action: 'SYNC', accountId, details: `Synced ${contactCount} contacts, ${dialogCount} dialogs` });
    return NextResponse.json({ success: true, data: { contacts: contactCount, dialogs: dialogCount } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String((err as Error)?.message || err) }, { status: 500 });
  }
}
