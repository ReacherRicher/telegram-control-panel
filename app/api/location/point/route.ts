import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { pushLocation } from '@/server/telegram/location';

/**
 * Public endpoint for the phone: authenticated by the per-session token (no admin cookie needed).
 * POST { token, latitude, longitude, accuracy?, altitude?, speed?, heading? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token : '';
  const latitude = Number(body.latitude), longitude = Number(body.longitude);

  if (!token) return NextResponse.json({ success: false, error: 'token required' }, { status: 401 });
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ success: false, error: 'valid latitude and longitude required' }, { status: 400 });
  }

  const s = await prisma.locationSession.findUnique({ where: { deviceToken: token } });
  if (!s) return NextResponse.json({ success: false, error: 'Unknown session' }, { status: 404 });
  if (s.status !== 'ACTIVE') return NextResponse.json({ success: false, error: 'Session is not active', status: s.status }, { status: 410 });

  const num = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const point = { latitude, longitude, accuracy: num(body.accuracy), heading: num(body.heading) };
  await prisma.locationPoint.create({ data: { sessionId: s.id, ...point, altitude: num(body.altitude), speed: num(body.speed) } });

  const push = await pushLocation(s.id, point);
  return NextResponse.json({ success: true, data: { sent: push.sent, error: push.error, hasDestination: !!s.destinationChatRaw } });
}

/** GET ?token= — session info for the share page */
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const s = token ? await prisma.locationSession.findUnique({ where: { deviceToken: token } }) : null;
  if (!s) return NextResponse.json({ success: false, error: 'Unknown session' }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: { status: s.status, destination: s.destinationChatRaw, updateInterval: s.updateInterval, durationSeconds: s.durationSeconds, startedAt: s.startedAt },
  });
}
