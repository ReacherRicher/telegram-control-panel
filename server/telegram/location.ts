/**
 * Live location sharing via MTProto.
 * First GPS point → sends a live-location message to the destination chat.
 * Next points    → edits that message (throttled by the session's updateInterval).
 * Stop / expiry  → marks the live location as stopped.
 */
import { Api } from 'telegram';
import { getClientForAccount } from './client';
import { resolvePeer } from './peer';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';

interface Point { latitude: number; longitude: number; accuracy?: number | null; heading?: number | null }

const g = globalThis as unknown as { __locLastSent?: Map<number, number> };
const lastSent = (g.__locLastSent ??= new Map<number, number>());

function geoMedia(p: Point, period: number, stopped = false) {
  return new Api.InputMediaGeoLive({
    geoPoint: new Api.InputGeoPoint({
      lat: p.latitude,
      long: p.longitude,
      accuracyRadius: p.accuracy ? Math.min(1500, Math.max(1, Math.round(p.accuracy))) : undefined,
    }),
    heading: p.heading && p.heading >= 1 && p.heading <= 360 ? Math.round(p.heading) : undefined,
    period,
    stopped: stopped || undefined,
  });
}

function periodFor(durationSeconds: number | null) {
  // Telegram accepts 60..86400 seconds, or 0x7FFFFFFF for "until stopped"
  if (!durationSeconds) return 0x7fffffff;
  return Math.min(86400, Math.max(60, durationSeconds));
}

export async function pushLocation(sessionId: number, point: Point): Promise<{ sent: boolean; error?: string }> {
  const s = await prisma.locationSession.findUnique({ where: { id: sessionId }, include: { account: { select: { slug: true } } } });
  if (!s || s.status !== 'ACTIVE' || !s.destinationChatRaw) return { sent: false };

  // Expired?
  if (s.durationSeconds && Date.now() - s.startedAt.getTime() > s.durationSeconds * 1000) {
    await prisma.locationSession.update({ where: { id: s.id }, data: { status: 'EXPIRED', endedAt: new Date() } });
    return { sent: false, error: 'Session expired' };
  }

  const prev = lastSent.get(s.id) || 0;
  if (s.telegramMessageId && Date.now() - prev < s.updateInterval * 1000) return { sent: false };
  lastSent.set(s.id, Date.now());

  try {
    const client = await getClientForAccount(s.account.slug);
    const dest = await resolvePeer(client, s.accountId, s.destinationChatRaw);
    const period = periodFor(s.durationSeconds);

    if (!s.telegramMessageId) {
      const res = await client.invoke(new Api.messages.SendMedia({ peer: dest.peer, media: geoMedia(point, period), message: '' }));
      let msgId: number | undefined;
      if (res instanceof Api.Updates || res instanceof Api.UpdatesCombined) {
        for (const u of res.updates) {
          if (u instanceof Api.UpdateMessageID) msgId = u.id;
          else if ((u instanceof Api.UpdateNewMessage || u instanceof Api.UpdateNewChannelMessage) && !msgId) msgId = u.message.id;
        }
      } else if (res instanceof Api.UpdateShortSentMessage) {
        msgId = res.id;
      }
      if (msgId) await prisma.locationSession.update({ where: { id: s.id }, data: { telegramMessageId: msgId } });
    } else {
      await client.invoke(new Api.messages.EditMessage({ peer: dest.peer, id: s.telegramMessageId, media: geoMedia(point, period) }));
    }
    return { sent: true };
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (msg.includes('MESSAGE_NOT_MODIFIED')) return { sent: false };
    logger.warn('Live location push failed', { sessionId, error: msg });
    return { sent: false, error: msg };
  }
}

export async function stopLiveLocation(sessionId: number) {
  const s = await prisma.locationSession.findUnique({
    where: { id: sessionId },
    include: { account: { select: { slug: true } }, points: { orderBy: { recordedAt: 'desc' }, take: 1 } },
  });
  lastSent.delete(sessionId);
  if (!s?.telegramMessageId || !s.destinationChatRaw || !s.points[0]) return;
  try {
    const client = await getClientForAccount(s.account.slug);
    const dest = await resolvePeer(client, s.accountId, s.destinationChatRaw);
    await client.invoke(new Api.messages.EditMessage({
      peer: dest.peer, id: s.telegramMessageId, media: geoMedia(s.points[0], periodFor(s.durationSeconds), true),
    }));
  } catch (err) {
    logger.warn('Stopping live location failed', { sessionId, error: String((err as Error)?.message || err) });
  }
}
