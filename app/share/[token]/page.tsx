'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

// Public page opened on the phone (no admin login). Authenticated by the session token in the URL.
interface Info { status: string; destination?: string; updateInterval: number; durationSeconds?: number; startedAt: string }

export default function SharePage() {
  const { token } = useParams() as { token: string };
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [last, setLast] = useState<{ lat: number; lon: number; acc?: number; at: number; sent?: boolean } | null>(null);
  const watchId = useRef<number | null>(null);
  const lastPost = useRef(0);

  useEffect(() => {
    fetch(`/api/location/point?token=${encodeURIComponent(token)}`).then((r) => r.json()).then((j) => {
      if (j.success) setInfo(j.data); else setError(j.error || 'Invalid link');
    }).catch(() => setError('Network error'));
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); };
  }, [token]);

  function start() {
    if (!('geolocation' in navigator)) { setError('This browser has no GPS access.'); return; }
    if (!window.isSecureContext) { setError('GPS needs an HTTPS page. Ask the admin to enable HTTPS.'); return; }
    setError('');
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(async (pos) => {
      const now = Date.now();
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, at: now };
      setLast((l) => ({ ...p, sent: l?.sent }));
      if (now - lastPost.current < Math.max(5, info?.updateInterval || 10) * 1000) return;
      lastPost.current = now;
      try {
        const r = await fetch('/api/location/point', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token, latitude: p.lat, longitude: p.lon, accuracy: pos.coords.accuracy,
            heading: pos.coords.heading, speed: pos.coords.speed, altitude: pos.coords.altitude,
          }),
        });
        const j = await r.json();
        if (r.status === 410) { stop(); setError('The session has ended.'); return; }
        setLast({ ...p, sent: !!j.data?.sent || undefined });
        if (j.data?.error) setError(j.data.error);
      } catch { setError('Could not reach the server — retrying…'); }
    }, (err) => { setError(err.message || 'Location permission denied'); setSharing(false); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }

  function stop() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  }

  const ended = info && info.status !== 'ACTIVE';

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="text-5xl">{sharing ? '📡' : '📍'}</div>
        <h1 className="text-xl font-semibold">Live location</h1>
        {info?.destination && <p className="text-slate-300 text-sm">Sharing to <b>{info.destination}</b></p>}
        {error && <div className="bg-red-500/20 border border-red-400/40 rounded-lg p-3 text-sm">{error}</div>}

        {info && !ended && (
          sharing ? (
            <button onClick={stop} className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 font-semibold text-lg">Stop sharing</button>
          ) : (
            <button onClick={start} className="w-full py-4 rounded-xl bg-sky-500 hover:bg-sky-600 font-semibold text-lg">Start sharing</button>
          )
        )}
        {ended && <p className="text-slate-400">This session has {info?.status.toLowerCase()}.</p>}

        {last && (
          <div className="text-xs text-slate-400 space-y-1">
            <div className="font-mono">{last.lat.toFixed(5)}, {last.lon.toFixed(5)}{last.acc ? ` ±${Math.round(last.acc)}m` : ''}</div>
            <div>{last.sent ? '✓ Telegram updated' : 'Waiting for next update…'}</div>
          </div>
        )}
        <p className="text-xs text-slate-500">Keep this page open and the screen on while sharing.</p>
      </div>
    </div>
  );
}
