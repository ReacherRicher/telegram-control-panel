'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Alert, ConfirmDialog, Spinner, useToast } from '@/components/ui';
import { api, formatDateTime, timeAgo } from '@/lib/client';

interface Session {
  hash: string; current: boolean; device: string; platform: string; systemVersion: string; appName: string; appVersion: string;
  officialApp: boolean; ip: string; location: string; createdAt: string; lastActiveAt: string; passwordPending: boolean;
}
interface Overview {
  twoFactor: { enabled: boolean; hint: string; hasRecoveryEmail: boolean; unconfirmedEmail: string; loginEmail: string };
  ttlDays: number; ttlOptions: number[];
}
type Level = 'everybody' | 'contacts' | 'nobody';
interface Privacy { key: string; label: string; level: Level; hasExceptions: boolean }

const LEVELS: { value: Level; label: string }[] = [
  { value: 'everybody', label: 'Everybody' }, { value: 'contacts', label: 'My contacts' }, { value: 'nobody', label: 'Nobody' },
];

function ttlLabel(days: number) {
  if (days % 365 === 0) return `${days / 365} year${days > 365 ? 's' : ''}`;
  if (days === 548) return '18 months';
  return `${Math.round(days / 30)} months`;
}

export default function SecurityPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [privacy, setPrivacy] = useState<Privacy[] | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'one'; s: Session } | { kind: 'all' } | null>(null);
  const [privacyConfirm, setPrivacyConfirm] = useState<{ p: Privacy; level: Level } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    const r = await api<Session[]>('/api/security?section=sessions');
    if (r.ok && r.data) setSessions(r.data); else { setSessions([]); setError(r.error || 'Could not load sessions'); }
  }, []);
  const loadOverview = useCallback(async () => {
    const r = await api<Overview>('/api/security');
    if (r.ok && r.data) setOverview(r.data);
  }, []);
  const loadPrivacy = useCallback(async () => {
    const r = await api<Privacy[]>('/api/security?section=privacy');
    setPrivacy(r.ok && r.data ? r.data : []);
  }, []);
  useEffect(() => { loadSessions(); loadOverview(); loadPrivacy(); }, [loadSessions, loadOverview, loadPrivacy]);

  async function doTerminate() {
    if (!confirm) return;
    setBusy(true);
    const r = confirm.kind === 'one'
      ? await api('/api/security', { body: { action: 'terminate', hash: confirm.s.hash } })
      : await api<{ terminated: number }>('/api/security', { body: { action: 'terminateOthers' } });
    setBusy(false); setConfirm(null);
    if (r.ok) { toast(confirm.kind === 'one' ? 'Session terminated' : 'All other sessions terminated', 'success'); loadSessions(); }
    else toast(r.error || 'Failed', 'error');
  }

  async function applyPrivacy(p: Privacy, level: Level) {
    setBusy(true);
    const r = await api('/api/security', { body: { action: 'privacy', key: p.key, level } });
    setBusy(false); setPrivacyConfirm(null);
    if (r.ok) { toast(`${p.label}: ${LEVELS.find((l) => l.value === level)?.label}`, 'success'); loadPrivacy(); }
    else toast(r.error || 'Failed', 'error');
  }

  async function setTtl(days: number) {
    const r = await api('/api/security', { body: { action: 'ttl', days } });
    if (r.ok) { toast(`Account self-destructs after ${ttlLabel(days)} of inactivity`, 'success'); loadOverview(); }
    else toast(r.error || 'Failed', 'error');
  }

  const others = sessions?.filter((s) => !s.current) || [];
  const unofficial = others.filter((s) => !s.officialApp).length;

  return (
    <DashboardLayout title="Security & Privacy" subtitle="Active sessions, two-step verification and privacy rules">
      <div className="max-w-5xl space-y-4">
        {error && <Alert kind="error">{error}</Alert>}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="card space-y-2">
            <h2 className="card-title">Two-step verification</h2>
            {!overview ? <div className="text-slate-400"><Spinner /> Loading…</div> : (
              <>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${overview.twoFactor.enabled ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="font-medium">{overview.twoFactor.enabled ? 'Enabled' : 'Disabled'}</span>
                </div>
                {overview.twoFactor.enabled ? (
                  <ul className="text-sm text-slate-600 space-y-0.5">
                    {overview.twoFactor.hint && <li>Hint: <b dir="auto">{overview.twoFactor.hint}</b></li>}
                    <li>Recovery email: {overview.twoFactor.hasRecoveryEmail ? 'set' : <span className="text-amber-600">not set</span>}</li>
                    {overview.twoFactor.unconfirmedEmail && <li className="text-amber-600">Unconfirmed email: {overview.twoFactor.unconfirmedEmail}</li>}
                  </ul>
                ) : (
                  <Alert kind="warning">Anyone who gets a login code can take over this account. Turn on a cloud password in an official Telegram app (Settings → Privacy and Security → Two-Step Verification).</Alert>
                )}
              </>
            )}
          </div>

          <div className="card space-y-2">
            <h2 className="card-title">Delete my account if away for</h2>
            {!overview ? <div className="text-slate-400"><Spinner /> Loading…</div> : (
              <>
                <select className="select" value={overview.ttlDays} onChange={(e) => setTtl(parseInt(e.target.value, 10))} aria-label="Account self-destruct period">
                  {Array.from(new Set([...overview.ttlOptions, overview.ttlDays])).sort((a, b) => a - b).map((d) => <option key={d} value={d}>{ttlLabel(d)}</option>)}
                </select>
                <p className="text-sm text-slate-500">Telegram deletes the account with all messages and contacts if it is not used for this long. Sessions in this panel count as activity only while connected.</p>
              </>
            )}
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <h2 className="card-title">Active sessions {sessions && <span className="text-slate-400 font-normal">({sessions.length})</span>}</h2>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={loadSessions}>↺ Refresh</button>
              <button className="btn-danger btn-sm" disabled={!others.length} onClick={() => setConfirm({ kind: 'all' })}>Terminate all other sessions</button>
            </div>
          </div>
          {unofficial > 0 && <Alert kind="warning">{unofficial} session(s) use an unofficial app. Terminate any you don’t recognise.</Alert>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Device / app</th><th>Location</th><th>Last active</th><th>Signed in</th><th></th></tr></thead>
              <tbody>
                {sessions === null && <tr><td colSpan={5} className="text-center py-6 text-slate-400"><Spinner /> Loading…</td></tr>}
                {sessions?.map((s) => (
                  <tr key={s.hash}>
                    <td>
                      <div className="font-medium">{s.device || 'Unknown device'} {s.current && <span className="badge-green ml-1">This panel</span>}{!s.officialApp && <span className="badge-yellow ml-1">Unofficial</span>}{s.passwordPending && <span className="badge-red ml-1">2FA pending</span>}</div>
                      <div className="text-xs text-slate-500">{s.appName} {s.appVersion} · {s.platform} {s.systemVersion}</div>
                    </td>
                    <td><div>{s.location || '—'}</div><div className="text-xs text-slate-500 font-mono" dir="ltr">{s.ip}</div></td>
                    <td title={formatDateTime(s.lastActiveAt)}>{s.current ? 'online' : timeAgo(s.lastActiveAt)}</td>
                    <td className="text-sm">{formatDateTime(s.createdAt)}</td>
                    <td className="text-right">{!s.current && <button className="btn-ghost btn-sm text-red-600" onClick={() => setConfirm({ kind: 'one', s })}>Terminate</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="card-title">Privacy</h2>
          {privacy === null ? <div className="text-slate-400"><Spinner /> Loading…</div> : (
            <div className="divide-y divide-slate-100">
              {privacy.map((p) => (
                <div key={p.key} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{p.label}</div>
                    {p.hasExceptions && <div className="text-xs text-amber-600">Has per-user exceptions (changing it here removes them)</div>}
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden" role="radiogroup" aria-label={p.label}>
                    {LEVELS.map((l) => (
                      <button key={l.value} role="radio" aria-checked={p.level === l.value} disabled={busy}
                        className={`px-3 py-1.5 text-sm ${p.level === l.value ? 'bg-sky-600 text-white' : 'bg-white hover:bg-slate-50 text-slate-600'}`}
                        onClick={() => { if (p.level === l.value) return; if (p.hasExceptions) setPrivacyConfirm({ p, level: l.value }); else applyPrivacy(p, l.value); }}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={!!confirm} danger busy={busy} onClose={() => setConfirm(null)} onConfirm={doTerminate}
        title={confirm?.kind === 'all' ? 'Terminate all other sessions?' : 'Terminate this session?'}
        confirmLabel="Terminate" requireText={confirm?.kind === 'all' ? 'TERMINATE' : undefined}>
        {confirm?.kind === 'all'
          ? <p>Every device except this panel ({others.length}) will be logged out of Telegram, including your phone and desktop apps.</p>
          : confirm?.kind === 'one' && <p><b>{confirm.s.device}</b> ({confirm.s.appName}, {confirm.s.ip} {confirm.s.location}) will be logged out.</p>}
      </ConfirmDialog>

      <ConfirmDialog open={!!privacyConfirm} busy={busy} onClose={() => setPrivacyConfirm(null)}
        onConfirm={() => privacyConfirm && applyPrivacy(privacyConfirm.p, privacyConfirm.level)}
        title="Replace privacy exceptions?" confirmLabel="Change">
        <p>“{privacyConfirm?.p.label}” has per-user or per-group exceptions. Setting it to <b>{LEVELS.find((l) => l.value === privacyConfirm?.level)?.label}</b> removes them.</p>
      </ConfirmDialog>
    </DashboardLayout>
  );
}
