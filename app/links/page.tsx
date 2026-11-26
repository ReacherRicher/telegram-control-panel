'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { EmptyState, Pagination, Spinner, useToast } from '@/components/ui';
import { api, formatDateTime, useDebounced } from '@/lib/client';

interface LinkRow {
  id: number; url: string; domain?: string;
  message: { telegramMessageId: number; date: string; chat: { title?: string; username?: string } };
}

function LinksList() {
  const sp = useSearchParams();
  const toast = useToast();
  const chatId = sp.get('chatId') || '';
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
  const q = useDebounced(search);
  const d = useDebounced(domain);

  const load = useCallback(async () => {
    setRows(null);
    const params = new URLSearchParams({ page: String(page), limit: '50', search: q, domain: d, ...(chatId ? { chatId } : {}) });
    const r = await api<LinkRow[]>(`/api/messages/links?${params}`);
    if (r.ok && r.data) { setRows(r.data); setTotal(r.json.total || 0); } else setRows([]);
  }, [page, q, d, chatId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, d]);

  function messageUrl(r: LinkRow) {
    return r.message.chat.username ? `https://t.me/${r.message.chat.username}/${r.message.telegramMessageId}` : null;
  }

  return (
    <DashboardLayout title="Links" subtitle={`${total.toLocaleString()} links found in indexed messages`}>
      <div className="space-y-4 max-w-6xl">
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="search" className="input sm:max-w-xs" placeholder="Search URL…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search URL" />
          <input type="search" className="input sm:max-w-xs" placeholder="Domain, e.g. youtube.com" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain" />
          {chatId && <Link href="/links" className="text-sm text-sky-600 hover:underline self-center">All chats</Link>}
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>URL</th><th>Chat</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={4} className="text-center py-8 text-slate-400"><Spinner /> Loading…</td></tr>}
              {rows?.length === 0 && <tr><td colSpan={4}><EmptyState icon="🔗" title="No links found">Links are collected when you index a chat.</EmptyState></td></tr>}
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-md">
                    <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-sky-700 hover:underline break-all text-sm">{r.url}</a>
                    {r.domain && <div className="text-xs text-slate-400">{r.domain}</div>}
                  </td>
                  <td className="text-xs max-w-[10rem] truncate" dir="auto">{r.message.chat.title || '—'}</td>
                  <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.message.date)}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(r.url); toast('Copied', 'success'); }}>Copy</button>
                    {messageUrl(r) && <a className="btn-ghost btn-sm" href={messageUrl(r)!} target="_blank" rel="noreferrer">Message ↗</a>}
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

export default function LinksPage() {
  return <Suspense><LinksList /></Suspense>;
}
