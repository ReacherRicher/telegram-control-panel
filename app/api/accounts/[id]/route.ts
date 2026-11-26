import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import { requireAuth, getSession } from '@/lib/session';
import prisma from '@/lib/prisma';
import { checkAccountConnection, disconnectAccount, sessionFilePath } from '@/server/telegram/client';
import { getAccountInfo, syncAccountInfoToDb } from '@/server/telegram/account';
import { syncContacts } from '@/server/telegram/contacts';
import { syncDialogs } from '@/server/telegram/dialogs';
import { createLog } from '@/server/services/log';

type Ctx = { params: Promise<{ id: string }> };

async function findAccount(ctx: Ctx) {
  const { id } = await ctx.params;
  return prisma.account.findFirst({ where: { id: parseInt(id, 10), isActive: true } });
}

// GET — single account status (live)
export async function GET(request: NextRequest, ctx: Ctx) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const account = await findAccount(ctx);
  if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

  const connected = await checkAccountConnection(account.slug);
  const liveInfo = connected ? await getAccountInfo(account.slug) : null;
  const { sessionFile: _sf, ...safe } = account;
  return NextResponse.json({ success: true, data: { ...safe, connected, liveInfo } });
}

// PATCH — { action: 'sync' | 'disconnect' } or { label, phone }
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const account = await findAccount(ctx);
  if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

  const { action, label, phone } = await request.json().catch(() => ({}));

  if (action === 'sync') {
    try {
      await syncAccountInfoToDb(account.slug);
      const contactCount = await syncContacts(account.slug, account.id);
      const dialogCount = await syncDialogs(account.slug, account.id);
      await createLog({ action: 'SYNC', accountId: account.id, details: `Synced ${contactCount} contacts, ${dialogCount} dialogs` });
      return NextResponse.json({ success: true, data: { contacts: contactCount, dialogs: dialogCount } });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: String((err as Error)?.message || err) }, { status: 500 });
    }
  }

  if (action === 'disconnect') {
    await disconnectAccount(account.slug);
    return NextResponse.json({ success: true });
  }

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: { label: label?.trim() || account.label, phone: phone?.trim() || account.phone },
  });
  return NextResponse.json({ success: true, data: { id: updated.id, label: updated.label, phone: updated.phone } });
}

// DELETE — remove account from the panel and log the panel session out of Telegram.
// Indexed data stays in the DB (hidden) so the slug can be re-added later.
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const account = await findAccount(ctx);
  if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

  const running = await prisma.job.count({ where: { accountId: account.id, status: { in: ['QUEUED', 'RUNNING', 'PAUSED'] } } });
  if (running > 0) {
    return NextResponse.json({ success: false, error: `This account has ${running} active job(s). Cancel them first.` }, { status: 400 });
  }

  await disconnectAccount(account.slug);
  try { fs.rmSync(sessionFilePath(account.slug), { force: true }); } catch { /* ignore */ }
  await prisma.account.update({ where: { id: account.id }, data: { isActive: false } });

  const session = await getSession();
  if (session.activeAccountId === account.id) {
    session.activeAccountId = undefined;
    await session.save();
  }
  await createLog({ action: 'LOGOUT', accountId: account.id, details: `Account removed from panel: ${account.label} (${account.slug})` });
  return NextResponse.json({ success: true });
}
