'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { EmptyState, Pagination, Spinner } from '@/components/ui';
import { api, formatDateTime, useDebounced } from '@/lib/client';
import { TYPE_BADGE } from '@/lib/labels';
import { formatBytes } from '@/lib/utils';

interface MediaItem {
  id: number; chatId: number; telegramMessageId: number; mediaType: string; fileName?: string; mimeType?: string;
  fileSize?: number; downloaded: boolean; hasFile: boolean;
  chat?: { id: number; title?: string; username?: string }; message?: { date: string; text?: string };
}

const TYPES = ['PHOTO', 'VIDEO', 'DOCUMENT', 'AUDIO', 'VOICE', 'GIF', 'STICKER'];

function MediaList() {
  const sp = useSearchParams();
  const chatId = sp.get('chatId') || '';
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState(sp.get('type') || '');
  const [downloaded, setDownloaded] = useState(sp.get('downloaded') || '');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);

  const load = useCallback(async () => {
    setItems(null);
    const params = new URLSearchParams({ page: String(page), limit: '50', type, downloaded, search: q, ...(chatId ? { chatId } : {}) });
    const r = await api<MediaItem[]>(`/api/media?${params}`);
    if (r.ok && r.data) { setItems(r.data); setTotal(r.json.total || 0); setTotalSize(Number(r.json.totalSize) || 0); } else setItems([]);
  }, [page, type, downloaded, q, chatId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, downloaded, q]);

  return (
    <DashboardLayout
      title="Media"
      subtitle={`${total.toLocaleString()} items${totalSize ? ` · ${formatBytes(totalSize)}` : ''}`}
      actions={<Link href={`/control?op=DOWNLOAD_MEDIA`} className="btn-primary btn-sm">🖼 Download media…</Link>}
    >
      <div className="space-y-4 max-w-6xl">
        <div className="flex flex-col md:flex-row gap-3 md:items-center flex-wrap">
          <input type="search" className="input md:max-w-xs" placeholder="Search file name…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search files" />
          <div className="flex flex-wrap gap-1.5">
            {['', ...TYPES].map((t) => (
              <button key={t || 'all'} aria-pressed={type === t} onClick={() => setType(t)}
                className={`px-3 py-1 rounded-full text-sm border ${type === t ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                {t ? t.charAt(0) + t.slice(1).toLowerCase() : 'All'}
              </button>
            ))}
          </div>
          <select className="select w-auto" value={downloaded} onChange={(e) => setDownloaded(e.target.value)} aria-label="Download state">
            <option value="">Any state</option>
            <option value="true">Downloaded</option>
            <option value="false">Not downloaded</option>
          </select>
          {chatId && <Link href="/media" className="text-sm text-sky-600 hover:underline">All chats</Link>}
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>File</th><th>Chat</th><th className="text-right">Size</th><th>Date</th><th className="text-right">File</th></tr></thead>
            <tbody>
              {items === null && <tr><td colSpan={6} className="text-center py-8 text-slate-400"><Spinner /> Loading…</td></tr>}
              {items?.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon="🖼" title="No media found">Media is listed after you <Link href="/chats" className="text-sky-600 hover:underline">index a chat</Link>.</EmptyState></td></tr>
              )}
              {items?.map((m) => (
                <tr key={m.id}>
                  <td><span className={TYPE_BADGE[m.mediaType] || 'badge-gray'}>{m.mediaType.toLowerCase()}</span></td>
                  <td className="max-w-xs">
                    <div className="truncate text-slate-700" dir="auto">{m.fileName || <span className="text-slate-400">{m.mimeType || '—'}</span>}</div>
                    {m.message?.text && <div className="text-xs text-slate-400 truncate" dir="auto">{m.message.text}</div>}
                  </td>
                  <td className="text-xs max-w-[10rem]"><Link href={`/media?chatId=${m.chatId}`} className="truncate block hover:text-sky-600" dir="auto">{m.chat?.title || '—'}</Link></td>
                  <td className="text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">{m.fileSize ? formatBytes(m.fileSize) : '—'}</td>
                  <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(m.message?.date)}</td>
                  <td className="text-right">
                    {m.hasFile ? (
                      <span className="inline-flex gap-1">
                        {['PHOTO', 'VIDEO', 'GIF', 'AUDIO', 'VOICE'].includes(m.mediaType) && <a className="btn-ghost btn-sm" href={`/api/media/${m.id}/file?inline=1`} target="_blank" rel="noreferrer">Open</a>}
                        <a className="btn-secondary btn-sm" href={`/api/media/${m.id}/file`}>⇩</a>
                      </span>
                    ) : <span className="text-xs text-slate-400">not downloaded</span>}
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

export default function MediaPage() {
  return <Suspense><MediaList /></Suspense>;
}
