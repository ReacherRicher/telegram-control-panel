'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { StatCard, Spinner, Alert, ProgressBar, useToast } from '@/components/ui';
import { api, timeAgo } from '@/lib/client';
import { JOB_LABELS, JOB_STATUS } from '@/lib/labels';
import { formatNumber } from '@/lib/utils';

interface DashboardData {
  account: {
    id: number; slug: string; label: string; firstName?: string; lastName?: string; username?: string;
    telegramId?: string; phone?: string; isPremium?: boolean; connected: boolean;
    liveInfo?: { firstName?: string; lastName?: string; username?: string; id?: string; phone?: string; isPremium?: boolean } | null;
  };
  stats: { contacts: number; privateChats: number; groups: number; channels: number; bots: number; messages: number; photos: number; videos: number; documents: number };
  jobs: { active: number; completed: number; failed: number };
}

interface JobRow { id: number; type: string; status: string; processedItems: number; totalItems: number; createdAt: string; sourceChat?: { title?: string } | null; sourceChatRaw?: string }

export default function DashboardPage() {
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [s, j] = await Promise.all([
      api<DashboardData>('/api/telegram/status'),
      api<JobRow[]>('/api/jobs?limit=6'),
    ]);
    if (s.ok && s.data) { setData(s.data); setError(''); } else if (s.json.code !== 'NO_ACCOUNT') setError(s.error || 'Failed to load status');
    if (j.ok && j.data) setJobs(j.data);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    const r = await api<{ contacts: number; dialogs: number }>('/api/telegram/sync', { method: 'POST' });
    setSyncing(false);
    if (r.ok && r.data) { toast(`Synced ${r.data.contacts} contacts and ${r.data.dialogs} chats`, 'success'); load(); }
    else toast('Sync failed: ' + r.error, 'error');
  }

  const acc = data?.account;
  const live = acc?.liveInfo;
  const name = live ? [live.firstName, live.lastName].filter(Boolean).join(' ') : [acc?.firstName, acc?.lastName].filter(Boolean).join(' ');
  const username = live?.username ?? acc?.username;
  const phone = live?.phone ?? acc?.phone;
  const neverSynced = data && data.stats.privateChats + data.stats.groups + data.stats.channels === 0;

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle={acc ? `${acc.label}${username ? ` · @${username}` : ''}` : undefined}
      actions={
        <button onClick={handleSync} disabled={syncing || !acc?.connected} className="btn-primary btn-sm">
          {syncing ? <><Spinner /> Syncing…</> : '⟳ Sync chats & contacts'}
        </button>
      }
    >
      {!data && !error && <div className="text-slate-400 text-sm flex items-center gap-2"><Spinner /> Loading…</div>}
      {error && !data && <Alert kind="error">{error}</Alert>}

      {data && acc && (
        <div className="space-y-6 max-w-6xl">
          {/* Account */}
          <div className="card flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-700 grid place-items-center text-lg font-semibold flex-shrink-0">
              {(name || acc.label || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-800" dir="auto">{name || acc.label}</span>
                {(live?.isPremium ?? acc.isPremium) && <span className="badge-purple">Premium</span>}
                <span className={acc.connected ? 'badge-green' : 'badge-red'}>{acc.connected ? '● Connected' : '● Disconnected'}</span>
              </div>
              <div className="text-sm text-slate-500 mt-0.5 flex gap-x-4 gap-y-0.5 flex-wrap">
                {username && <span>@{username}</span>}
                {phone && <span>+{phone.replace(/^\+/, '')}</span>}
                {(live?.id ?? acc.telegramId) && <span className="font-mono text-xs">ID {live?.id ?? acc.telegramId}</span>}
              </div>
            </div>
            {!acc.connected && <Link href="/accounts" className="btn-primary btn-sm">Log in again</Link>}
          </div>

          {neverSynced && acc.connected && (
            <Alert kind="info">
              Your chats haven’t been synced yet. Click <b>Sync chats &amp; contacts</b> to load your dialogs — most features need this first.
            </Alert>
          )}

          {/* Stats */}
          <section>
            <h2 className="card-title mb-3">Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Private chats" value={formatNumber(data.stats.privateChats)} href="/chats?filter=private" />
              <StatCard label="Groups" value={formatNumber(data.stats.groups)} href="/chats?filter=groups" />
              <StatCard label="Channels" value={formatNumber(data.stats.channels)} href="/chats?filter=channels" />
              <StatCard label="Contacts" value={formatNumber(data.stats.contacts)} href="/contacts" />
              <StatCard label="Indexed messages" value={formatNumber(data.stats.messages)} href="/messages" />
              <StatCard label="Photos" value={formatNumber(data.stats.photos)} href="/media?type=PHOTO" />
              <StatCard label="Videos" value={formatNumber(data.stats.videos)} href="/media?type=VIDEO" />
              <StatCard label="Documents" value={formatNumber(data.stats.documents)} href="/media?type=DOCUMENT" />
            </div>
          </section>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Recent jobs */}
            <section className="lg:col-span-2 card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="card-title">Recent jobs</h2>
                <Link href="/jobs" className="text-sm text-sky-600 hover:underline">All jobs →</Link>
              </div>
              {jobs.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No jobs yet. Start one from <Link href="/control" className="text-sky-600 hover:underline">Operations</Link>.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50 -mx-2 px-2 rounded">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${JOB_STATUS[j.status]?.dot}`} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-700 truncate">
                            {JOB_LABELS[j.type] || j.type}
                            {(j.sourceChat?.title || j.sourceChatRaw) && <span className="text-slate-400 font-normal"> · <bdi>{j.sourceChat?.title || j.sourceChatRaw}</bdi></span>}
                          </span>
                          {j.status === 'RUNNING' && <span className="block mt-1 max-w-xs"><ProgressBar value={j.processedItems} max={j.totalItems} status={j.status} /></span>}
                        </span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(j.createdAt)}</span>
                        <span className={JOB_STATUS[j.status]?.badge}>{JOB_STATUS[j.status]?.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Quick actions */}
            <section className="card">
              <h2 className="card-title mb-3">Quick actions</h2>
              <div className="grid gap-2">
                <Link href="/control?op=FORWARD_MESSAGES" className="btn-secondary justify-start">↪ Forward messages</Link>
                <Link href="/control?op=EXPORT_MESSAGES" className="btn-secondary justify-start">⇩ Export a chat</Link>
                <Link href="/control?op=DOWNLOAD_MEDIA" className="btn-secondary justify-start">🖼 Download media</Link>
                <Link href="/control?op=JOIN_CHAT" className="btn-secondary justify-start">➕ Join a chat</Link>
                <Link href="/chats" className="btn-secondary justify-start">🔍 Index a chat</Link>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div><div className="text-lg font-bold text-sky-600 tabular-nums">{data.jobs.active}</div><div className="text-[11px] text-slate-500">Active</div></div>
                <div><div className="text-lg font-bold text-emerald-600 tabular-nums">{data.jobs.completed}</div><div className="text-[11px] text-slate-500">Done</div></div>
                <div><div className="text-lg font-bold text-red-600 tabular-nums">{data.jobs.failed}</div><div className="text-[11px] text-slate-500">Failed</div></div>
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
