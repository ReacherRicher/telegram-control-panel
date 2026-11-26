'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ChatPicker from '@/components/chats/ChatPicker';
import { Alert, EmptyState, Spinner, useToast } from '@/components/ui';
import { api, timeAgo } from '@/lib/client';

interface LocationSession {
  id: number; deviceToken?: string; destinationChatRaw?: string; durationSeconds?: number; updateInterval: number;
  startedAt: string; endedAt?: string; status: string; telegramMessageId?: number;
  points: Array<{ latitude: number; longitude: number; accuracy?: number; recordedAt: string }>;
  _count: { points: number };
}

const DURATIONS = [
  { v: '900', l: '15 min' }, { v: '3600', l: '1 hour' }, { v: '28800', l: '8 hours' }, { v: '86400', l: '24 hours' },
];

export default function LocationPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<LocationSession[] | null>(null);
  const [destChat, setDestChat] = useState('');
  const [duration, setDuration] = useState('3600');
  const [interval, setInterval_] = useState('15');
  const [starting, setStarting] = useState(false);
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    const r = await api<LocationSession[]>('/api/location');
    if (r.ok && r.data) setSessions(r.data);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    const r = await api<{ sessionId: number; sharePath: string }>('/api/location', {
      body: { action: 'start', destinationChat: destChat || undefined, duration, updateInterval: interval },
    });
    setStarting(false);
    if (r.ok) { toast('Session created — open the share link on your phone', 'success'); load(); }
    else toast(r.error || 'Failed', 'error');
  }

  async function stop(id: number) {
    await api('/api/location', { body: { action: 'stop', sessionId: id } });
    load();
  }

  async function clearOld() {
    if (!confirm('Delete finished sessions older than the retention period?')) return;
    const r = await api<{ deleted: number }>('/api/location', { method: 'DELETE' });
    if (r.ok) toast(`Deleted ${r.data?.deleted ?? 0} old sessions`, 'success');
    load();
  }

  const isHttps = origin.startsWith('https://') || origin.includes('localhost');

  return (
    <DashboardLayout title="Live location" subtitle="Share your phone’s GPS to a Telegram chat as a live location">
      <div className="max-w-3xl space-y-6">
        <div className="card space-y-2 text-sm text-slate-600">
          <h2 className="card-title">How it works</h2>
          <ol className="list-decimal list-inside space-y-1">
            <li>Create a session below and choose the chat that should see your location.</li>
            <li>Open the <b>share link</b> on your phone and tap <b>Start sharing</b>.</li>
            <li>The panel sends a Telegram live location and keeps updating it until you stop or it expires.</li>
          </ol>
          {!isHttps && origin && (
            <Alert kind="warning" className="mt-2">
              Phones only allow GPS access on <b>HTTPS</b> pages. Put the panel behind HTTPS (Nginx/Caddy + certificate) for the share link to work.
            </Alert>
          )}
        </div>

        <form onSubmit={start} className="card space-y-4">
          <h2 className="card-title">New session</h2>
          <div>
            <label className="label" htmlFor="loc-dst">Send to chat</label>
            <ChatPicker id="loc-dst" value={destChat} onChange={setDestChat} placeholder="@username or search… (empty = only record points)" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <span className="label">Duration</span>
              <div className="segmented">
                {DURATIONS.map((d) => <button key={d.v} type="button" aria-pressed={duration === d.v} onClick={() => setDuration(d.v)}>{d.l}</button>)}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="loc-int">Update every</label>
              <select id="loc-int" className="select" value={interval} onChange={(e) => setInterval_(e.target.value)}>
                <option value="10">10 seconds</option>
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={starting} className="btn-primary">{starting ? <><Spinner /> Creating…</> : '📍 Create session'}</button>
          </div>
        </form>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="card-title">Sessions</h2>
            <button className="btn-ghost btn-sm" onClick={clearOld}>Clean up old</button>
          </div>
          {sessions === null && <div className="text-slate-400 text-sm"><Spinner /> Loading…</div>}
          {sessions?.length === 0 && <EmptyState icon="📍" title="No sessions yet" />}
          <div className="divide-y divide-slate-100">
            {sessions?.map((s) => {
              const last = s.points[0];
              const link = s.deviceToken ? `${origin}/share/${s.deviceToken}` : '';
              const live = s.status === 'ACTIVE';
              return (
                <div key={s.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                        <span className="font-medium text-sm">{live ? 'Live' : s.status.charAt(0) + s.status.slice(1).toLowerCase()} · #{s.id}</span>
                        {s.destinationChatRaw && <span className="text-xs text-slate-500">→ {s.destinationChatRaw}</span>}
                        {s.telegramMessageId && <span className="badge-green">sent to Telegram</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Started {timeAgo(s.startedAt)} · {s._count.points} points
                        {last && <> · last <a className="text-sky-600 hover:underline" href={`https://www.openstreetmap.org/?mlat=${last.latitude}&mlon=${last.longitude}#map=16/${last.latitude}/${last.longitude}`} target="_blank" rel="noreferrer">{last.latitude.toFixed(5)}, {last.longitude.toFixed(5)}</a> {timeAgo(last.recordedAt)}</>}
                      </div>
                    </div>
                    {live && <button className="btn-danger btn-sm" onClick={() => stop(s.id)}>Stop</button>}
                  </div>
                  {live && link && (
                    <div className="flex gap-2">
                      <input className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
                      <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(link); toast('Link copied', 'success'); }}>Copy</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <details className="card text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">API for custom clients</summary>
          <pre className="bg-slate-50 p-3 rounded mt-3 text-xs overflow-x-auto">{`POST /api/location/point
{ "token": "<session token>", "latitude": 48.8584, "longitude": 2.2945,
  "accuracy": 10, "heading": 90, "speed": 0, "altitude": 1200 }`}</pre>
        </details>
      </div>
    </DashboardLayout>
  );
}
