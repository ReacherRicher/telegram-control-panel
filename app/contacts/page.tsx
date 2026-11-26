'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { EmptyState, Pagination, Spinner } from '@/components/ui';
import { api, useDebounced } from '@/lib/client';

interface Contact {
  id: number; telegramId: string; firstName: string; lastName?: string; username?: string; phone?: string;
  isPremium: boolean; isVerified: boolean; isBot: boolean;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [all, setAll] = useState(false);
  const q = useDebounced(search);

  const load = useCallback(async () => {
    setContacts(null);
    const params = new URLSearchParams({ page: String(page), limit: '50', search: q, all: String(all) });
    const r = await api<Contact[]>(`/api/contacts?${params}`);
    if (r.ok && r.data) { setContacts(r.data); setTotal(r.json.total || 0); } else setContacts([]);
  }, [page, q, all]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, all]);

  return (
    <DashboardLayout title="Contacts" subtitle={`${total.toLocaleString()} ${all ? 'people' : 'contacts'}`}>
      <div className="space-y-4 max-w-5xl">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input type="search" className="input sm:max-w-xs" placeholder="Search name, @username, phone, ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search contacts" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Include message senders that aren’t contacts
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Phone</th><th>Telegram ID</th><th></th></tr></thead>
            <tbody>
              {contacts === null && <tr><td colSpan={5} className="text-center py-8 text-slate-400"><Spinner /> Loading…</td></tr>}
              {contacts?.length === 0 && <tr><td colSpan={5}><EmptyState icon="👤" title="No contacts found">Run <b>Sync</b> on the Dashboard to load your contacts.</EmptyState></td></tr>}
              {contacts?.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium" dir="auto">{[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td>{c.username ? <a href={`https://t.me/${c.username}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">@{c.username}</a> : <span className="text-slate-400">—</span>}</td>
                  <td className="tabular-nums" dir="ltr">{c.phone ? `+${c.phone.replace(/^\+/, '')}` : <span className="text-slate-400 text-xs">hidden</span>}</td>
                  <td className="text-slate-500 text-xs font-mono">{c.telegramId}</td>
                  <td>
                    <div className="flex gap-1 justify-end items-center">
                      {c.isPremium && <span className="badge-purple">Premium</span>}
                      {c.isVerified && <span className="badge-blue">Verified</span>}
                      {c.isBot && <span className="badge-gray">Bot</span>}
                      <Link href={`/control?op=EXPORT_MESSAGES&source=${encodeURIComponent(c.username ? `@${c.username}` : c.telegramId)}`} className="btn-ghost btn-sm" title="Export chat">⇩</Link>
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
