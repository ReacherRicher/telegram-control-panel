import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAccount } from '@/lib/session';
import prisma from '@/lib/prisma';
import { createLog } from '@/server/services/log';
import { resolveChat } from '@/server/telegram/dialogs';
import { pushLocation, stopLiveLocation } from '@/server/telegram/location';

export async function GET(request: NextRequest) {
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  // Expire sessions whose duration has passed
  const active = await prisma.locationSession.findMany({ where: { accountId, status: 'ACTIVE', durationSeconds: { not: null } } });
  for (const s of active) {
    if (Date.now() - s.startedAt.getTime() > (s.durationSeconds || 0) * 1000) {
      await prisma.locationSession.update({ where: { id: s.id }, data: { status: 'EXPIRED', endedAt: new Date() } });
    }
  }

  const sessions = await prisma.locationSession.findMany({
    where: { accountId },
    orderBy: { startedAt: 'desc' },
    take: 20,
    include: { points: { orderBy: { recordedAt: 'desc' }, take: 1 }, _count: { select: { points: true } } },
  });

  return NextResponse.json({ success: true, data: sessions });
}

async function handlePost(request: NextRequest) {
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const body = await request.json().catch(() => ({}));
  const { action, duration, updateInterval, sessionId } = body;
  const destinationChat = typeof body.destinationChat === 'string' ? body.destinationChat.trim() : '';

  if (action === 'start') {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });

    let destChatDbId: number | undefined;
    let destRaw: string | undefined;
    if (destinationChat) {
      const info = await resolveChat(account.slug, destinationChat, accountId);
      if (!info) return NextResponse.json({ success: false, error: `Could not resolve "${destinationChat}"` }, { status: 400 });
      destRaw = info.username ? `@${info.username}` : info.telegramId;
      const dbChat = await prisma.chat.findFirst({ where: { accountId, telegramId: info.telegramId } });
      if (dbChat) destChatDbId = dbChat.id;
    }

    const deviceToken = randomBytes(18).toString('base64url');
    const session = await prisma.locationSession.create({
      data: {
        accountId, deviceId: String(body.deviceId || 'phone'), destinationChatId: destChatDbId, destinationChatRaw: destRaw,
        durationSeconds: duration ? parseInt(duration, 10) : null,
        updateInterval: updateInterval ? Math.max(5, parseInt(updateInterval, 10)) : 10,
        status: 'ACTIVE', deviceToken,
      },
    });
    await createLog({ action: 'LOCATION_START', accountId, details: `Session #${session.id}`, destChat: destinationChat || undefined });
    return NextResponse.json({ success: true, data: { sessionId: session.id, token: deviceToken, sharePath: `/share/${deviceToken}` } });
  }

  if (action === 'stop') {
    if (!sessionId) return NextResponse.json({ success: false, error: 'sessionId required' }, { status: 400 });
    const id = parseInt(sessionId, 10);
    const r = await prisma.locationSession.updateMany({ where: { id, accountId, status: 'ACTIVE' }, data: { status: 'STOPPED', endedAt: new Date() } });
    if (r.count) await stopLiveLocation(id);
    await createLog({ action: 'LOCATION_STOP', accountId, details: `Session #${sessionId}` });
    return NextResponse.json({ success: true });
  }

  if (action === 'point') {
    // Admin-side point submission (phones should use /api/location/point with the session token)
    const { latitude, longitude } = body;
    if (!sessionId || latitude === undefined || longitude === undefined) {
      return NextResponse.json({ success: false, error: 'sessionId, latitude, longitude required' }, { status: 400 });
    }
    const s = await prisma.locationSession.findFirst({ where: { id: parseInt(sessionId, 10), accountId, status: 'ACTIVE' } });
    if (!s) return NextResponse.json({ success: false, error: 'Session not active' }, { status: 400 });
    const point = { latitude: Number(latitude), longitude: Number(longitude), accuracy: body.accuracy ? Number(body.accuracy) : null, heading: body.heading ? Number(body.heading) : null };
    await prisma.locationPoint.create({ data: { sessionId: s.id, ...point, altitude: body.altitude ? Number(body.altitude) : null, speed: body.speed ? Number(body.speed) : null } });
    const push = await pushLocation(s.id, point);
    return NextResponse.json({ success: true, data: push });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const accountResult = await requireAccount(request);
  if (accountResult instanceof NextResponse) return accountResult;
  const { accountId } = accountResult;

  const retentionDays = parseInt(process.env.LOCATION_RETENTION_DAYS || '7', 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const oldSessions = await prisma.locationSession.findMany({ where: { accountId, startedAt: { lt: cutoff }, status: { not: 'ACTIVE' } }, select: { id: true } });
  const ids = oldSessions.map((s) => s.id);
  if (ids.length > 0) {
    await prisma.locationPoint.deleteMany({ where: { sessionId: { in: ids } } });
    await prisma.locationSession.deleteMany({ where: { id: { in: ids } } });
  }
  return NextResponse.json({ success: true, data: { deleted: ids.length, retentionDays } });
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err) {
    // e.g. account not logged in, Telegram unreachable — surface the reason instead of a bare 500
    return NextResponse.json({ success: false, error: String((err as Error)?.message || err) }, { status: 500 });
  }
}
