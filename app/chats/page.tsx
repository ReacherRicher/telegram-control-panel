'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { EmptyState, Pagination, Spinner, useToast } from '@/components/ui';
import { api, timeAgo, useDebounced } from '@/lib/client';
import { CHAT_TYPES } from '@/lib/labels';

interface Chat {
  id: number; telegramId: string; title?: string; username?: string; type: string;
  isMember: boolean; isAdmin: boolean; isOwner: boolean; messageCount: number; membersCount?: number;
  lastIndexedAt?: string;
}

const FILTERS = [
  { value: 'all', label: 'All' }, { value: 'private', label: 'Private' }, { value: 'groups', label: 'Groups' },
  { value: 'channels', label: 'Channels' }, { value: 'bots', label: 'Bots' }, { value: 'admin', label: 'I’m admin' },
  { value: 'owner', label: 'I own' }, { value: 'indexed', label: 'Indexed' },
];

function ChatsList() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(sp.get('filter') || 'all');
  const [indexing, setIndexing] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const q = useDebounced(search);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '50', search: q, filter });
    const r = await api<Chat[]>(`/api/chats?${params}`);
    if (r.ok && r.data) { setChats(r.data); setTotal(r.json.total || 0); }
  }, [page, q, filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, filter]);

  async function index(c: Chat) {
    setIndexing(c.id);
    const r = await api<{ jobId: number }>(`/api/chats/${c.id}/index`, { body: {} });
    setIndexing(null);
    if (r.ok && r.data) { toast(`Indexing “${c.title}” — job #${r.data.jobId}`, 'success'); router.push(`/jobs/${r.data.jobId}`); }
    else toast(r.error || 'Failed', 'error');
  }

  async function sync() {
    setSyncing(true);
    const r = await api<{ contacts: number; dialogs: number }>('/api/telegram/sync', { method: 'POST' });
    setSyncing(false);
    if (r.ok && r.data) { toast(`Synced ${r.data.dialogs} chats`, 'success'); load(); } else toast('Sync failed: ' + r.error, 'error');
  }

  const op = (c: Chat, o: string) => `/control?op=${o}&source=${encodeURIComponent(c.username ? `@${c.username}` : c.telegramId)}`;

  return (
    <DashboardLayout
      title="Chats" subtitle={`${total.toLocaleString()} chats`}
      actions={<button className="btn-secondary btn-sm" onClick={sync} disabled={syncing}>{syncing ? <><Spinner /> Syncing…</> : '⟳ Sync'}</button>}
    >
      <div className="space-y-4 max-w-6xl">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <input type="search" className="input md:max-w-xs" placeholder="Search name, @username or ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search chats" />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.value} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}
                className={`px-3 py-1 rounded-full text-sm border ${filter === f.value ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Chat</th><th>Type</th><th>Role</th><th className="text-right">Indexed msgs</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {chats === null && <tr><td colSpan={5} className="text-center py-8 text-slate-400"><Spinner /> Loading…</td></tr>}
              {chats?.length === 0 && (
                <tr><td colSpan={5}>
                  <EmptyState icon="💬" title={q || filter !== 'all' ? 'No chats match' : 'No chats synced yet'}>
                    {!q && filter === 'all' && <button className="btn-primary mt-3" onClick={sync} disabled={syncing}>⟳ Sync chats now</button>}
                  </EmptyState>
                </td></tr>
              )}
              {chats?.map((c) => (
                <tr key={c.id}>
                  <td className="max-w-[22rem]">
                    <Link href={`/chats/${c.id}`} className="flex items-center gap-2 group">
                      <span className="w-8 h-8 rounded-full bg-slate-100 grid place-items-center flex-shrink-0">{CHAT_TYPES[c.type]?.icon || '💬'}</span>
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-800 group-hover:text-sky-600 truncate" dir="auto">{c.title || '—'}</span>
                        <span className="block text-xs text-slate-400 truncate">{c.username ? `@${c.username}` : `ID ${c.telegramId}`}{c.membersCount ? ` · ${c.membersCount.toLocaleString()} members` : ''}</span>
                      </span>
                    </Link>
                  </td>
                  <td><span className={CHAT_TYPES[c.type]?.badge || 'badge-gray'}>{CHAT_TYPES[c.type]?.label || c.type}</span></td>
                  <td>
                    {c.isOwner ? <span className="badge-red">Owner</span> : c.isAdmin ? <span className="badge-yellow">Admin</span>
                      : !c.isMember ? <span className="badge-gray">Left</span> : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="text-right tabular-nums text-slate-600">
                    {c.lastIndexedAt ? <span title={`Indexed ${timeAgo(c.lastIndexedAt)}`}>{c.messageCount.toLocaleString()}</span> : <span className="text-xs text-slate-400">not indexed</span>}
                  </td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="btn-ghost btn-sm" onClick={() => index(c)} disabled={indexing === c.id} title="Index messages">{indexing === c.id ? <Spinner /> : '🔍'} Index</button>
                      <Link className="btn-ghost btn-sm" href={op(c, 'FORWARD_MESSAGES')} title="Forward">↪</Link>
                      <Link className="btn-ghost btn-sm" href={op(c, 'EXPORT_MESSAGES')} title="Export">⇩</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={Math.ceil(total / 50)} onChange={setPage} />
      </div>
    </DashboardLayout>
  );
}

export default function ChatsPage() {
  return <Suspense><ChatsList /></Suspense>;
}
