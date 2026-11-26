'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { EmptyState, Pagination, Spinner } from '@/components/ui';
import { api, formatDateTime, useDebounced } from '@/lib/client';
import { MESSAGE_TYPES, TYPE_BADGE } from '@/lib/labels';

interface Message {
  id: number; telegramMessageId: number; date: string; text?: string; messageType: string;
  fileName?: string; chatId: number;
  chat?: { title?: string; username?: string };
  sender?: { firstName?: string; lastName?: string; username?: string } | null;
}

function MessagesList() {
  const sp = useSearchParams();
  const chatId = sp.get('chatId') || '';
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const q = useDebounced(search);

  const load = useCallback(async () => {
    setMessages(null);
    const params = new URLSearchParams({ page: String(page), limit: '50', search: q, type, dateFrom, dateTo, ...(chatId ? { chatId } : {}) });
    const r = await api<Message[]>(`/api/messages?${params}`);
    if (r.ok && r.data) { setMessages(r.data); setTotal(r.json.total || 0); } else setMessages([]);
  }, [page, q, type, dateFrom, dateTo, chatId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, type, dateFrom, dateTo]);

  const chatTitle = messages?.[0]?.chat?.title;

  return (
    <DashboardLayout
      title="Messages"
      subtitle={<>{total.toLocaleString()} indexed messages{chatId && chatTitle ? <> in <bdi>{chatTitle}</bdi></> : ''}</>}
      actions={chatId ? <Link href="/messages" className="btn-ghost btn-sm">Show all chats</Link> : undefined}
    >
      <div className="space-y-4 max-w-6xl">
        <div className="card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label" htmlFor="ms">Search text</label>
            <input id="ms" type="search" className="input" placeholder="Words in the message…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="mt">Type</label>
            <select id="mt" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {MESSAGE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mf">From</label>
            <input id="mf" type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="mto">To</label>
            <input id="mto" type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th className="w-40">Date</th>{!chatId && <th>Chat</th>}<th>Sender</th><th>Message</th></tr></thead>
            <tbody>
              {messages === null && <tr><td colSpan={4} className="text-center py-8 text-slate-400"><Spinner /> Loading…</td></tr>}
              {messages?.length === 0 && (
                <tr><td colSpan={4}><EmptyState icon="📨" title="No messages found">Messages appear here after you <Link href="/chats" className="text-sky-600 hover:underline">index a chat</Link>.</EmptyState></td></tr>
              )}
              {messages?.map((m) => {
                const sender = m.sender ? [m.sender.firstName, m.sender.lastName].filter(Boolean).join(' ') || (m.sender.username ? `@${m.sender.username}` : '') : '';
                const long = (m.text?.length || 0) > 160;
                return (
                  <tr key={m.id} className="align-top">
                    <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(m.date)}</td>
                    {!chatId && <td className="text-xs max-w-[10rem]"><Link href={`/messages?chatId=${m.chatId}`} className="hover:text-sky-600 truncate block" dir="auto">{m.chat?.title || (m.chat?.username ? `@${m.chat.username}` : '—')}</Link></td>}
                    <td className="text-xs text-slate-600 max-w-[10rem] truncate" dir="auto">{sender || '—'}</td>
                    <td className="text-sm max-w-xl">
                      <div className="flex gap-2 items-start">
                        {m.messageType !== 'TEXT' && <span className={TYPE_BADGE[m.messageType] || 'badge-gray'}>{m.messageType.toLowerCase()}</span>}
                        <div className="min-w-0 flex-1">
                          {m.fileName && <div className="text-xs text-slate-500 truncate">📎 {m.fileName}</div>}
                          {m.text ? (
                            <div dir="auto" className={`whitespace-pre-wrap break-words ${expanded === m.id || !long ? '' : 'line-clamp-2'}`}>{m.text}</div>
                          ) : !m.fileName && <span className="text-slate-400 italic">no text</span>}
                          {long && <button className="text-xs text-sky-600 hover:underline" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>{expanded === m.id ? 'Show less' : 'Show more'}</button>}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={Math.ceil(total / 50)} onChange={setPage} />
      </div>
    </DashboardLayout>
  );
}

export default function MessagesPage() {
  return <Suspense><MessagesList /></Suspense>;
}
