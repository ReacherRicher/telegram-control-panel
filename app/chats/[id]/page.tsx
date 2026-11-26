'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Alert, Spinner, StatCard, useToast } from '@/components/ui';
import { api, formatDateTime, timeAgo } from '@/lib/client';
import { CHAT_TYPES } from '@/lib/labels';
import { formatNumber } from '@/lib/utils';

interface ChatDetail {
  id: number; telegramId: string; title?: string; username?: string; type: string;
  isPublic: boolean; isMember: boolean; isAdmin: boolean; isOwner: boolean; publicUrl?: string; membersCount?: number;
  messageCount: number; photoCount: number; videoCount: number; documentCount: number; audioCount: number;
  voiceCount: number; gifCount: number; stickerCount: number; linkCount: number;
  firstMessageDate?: string; lastMessageDate?: string; lastIndexedAt?: string;
}

export default function ChatDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const id = params.id as string;
  const [chat, setChat] = useState<ChatDetail | null>(null);
  const [error, setError] = useState('');
  const [indexing, setIndexing] = useState(false);

  useEffect(() => {
    api<ChatDetail>(`/api/chats/${id}`).then((r) => { if (r.ok && r.data) setChat(r.data); else setError(r.error || 'Not found'); });
  }, [id]);

  async function handleIndex() {
    setIndexing(true);
    const r = await api<{ jobId: number }>(`/api/chats/${id}/index`, { body: {} });
    setIndexing(false);
    if (r.ok && r.data) router.push(`/jobs/${r.data.jobId}`); else toast(r.error || 'Failed', 'error');
  }

  if (error) return <DashboardLayout title="Chat"><Alert kind="error">{error}</Alert></DashboardLayout>;
  if (!chat) return <DashboardLayout title="Chat"><div className="text-slate-400 flex items-center gap-2"><Spinner /> Loading…</div></DashboardLayout>;

  const src = encodeURIComponent(chat.username ? `@${chat.username}` : chat.telegramId);
  const t = CHAT_TYPES[chat.type];

  return (
    <DashboardLayout
      title={<span dir="auto">{chat.title || 'Chat'}</span>}
      subtitle={<>{t?.label || chat.type}{chat.username ? ` · @${chat.username}` : ''}</>}
      actions={<Link href="/chats" className="btn-ghost btn-sm">← Chats</Link>}
    >
      <div className="max-w-4xl space-y-4">
        <div className="card flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 grid place-items-center text-2xl">{t?.icon || '💬'}</div>
          <div className="flex-1 text-sm grid grid-cols-2 gap-x-6 gap-y-1">
            <div><span className="text-slate-500">ID </span><span className="font-mono">{chat.telegramId}</span></div>
            <div><span className="text-slate-500">Visibility </span>{chat.isPublic ? 'Public' : 'Private'}</div>
            <div><span className="text-slate-500">Membership </span>{chat.isMember ? 'Member' : 'Left'}</div>
            <div><span className="text-slate-500">Role </span>{chat.isOwner ? 'Owner' : chat.isAdmin ? 'Admin' : 'Member'}</div>
            {chat.membersCount ? <div><span className="text-slate-500">Members </span>{chat.membersCount.toLocaleString()}</div> : null}
            {chat.publicUrl && <div><a href={chat.publicUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">{chat.publicUrl.replace('https://', '')} ↗</a></div>}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div>
              <h3 className="card-title">Indexed content</h3>
              <p className="text-xs text-slate-500">{chat.lastIndexedAt ? `Last indexed ${timeAgo(chat.lastIndexedAt)}` : 'Not indexed yet — index to enable search, stats and links'}</p>
            </div>
            <button onClick={handleIndex} disabled={indexing} className="btn-primary btn-sm">
              {indexing ? <><Spinner /> Starting…</> : chat.lastIndexedAt ? '⟳ Re-index' : '🔍 Index chat'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Messages" value={formatNumber(chat.messageCount)} href={`/messages?chatId=${chat.id}`} />
            <StatCard label="Photos" value={formatNumber(chat.photoCount)} href={`/media?chatId=${chat.id}&type=PHOTO`} />
            <StatCard label="Videos" value={formatNumber(chat.videoCount)} href={`/media?chatId=${chat.id}&type=VIDEO`} />
            <StatCard label="Files" value={formatNumber(chat.documentCount)} href={`/media?chatId=${chat.id}&type=DOCUMENT`} />
            <StatCard label="Links" value={formatNumber(chat.linkCount)} href={`/links?chatId=${chat.id}`} />
            <StatCard label="Audio" value={formatNumber(chat.audioCount)} />
            <StatCard label="Voice" value={formatNumber(chat.voiceCount)} />
            <StatCard label="GIFs" value={formatNumber(chat.gifCount)} />
            <StatCard label="Stickers" value={formatNumber(chat.stickerCount)} />
          </div>
          {chat.firstMessageDate && (
            <p className="mt-3 text-xs text-slate-500">
              Range: {formatDateTime(chat.firstMessageDate)} → {formatDateTime(chat.lastMessageDate)}
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Operations</h3>
          <div className="flex flex-wrap gap-2">
            <Link href={`/control?source=${src}&op=FORWARD_MESSAGES`} className="btn-secondary btn-sm">↪ Forward</Link>
            <Link href={`/control?source=${src}&op=EXPORT_MESSAGES`} className="btn-secondary btn-sm">⇩ Export</Link>
            <Link href={`/control?source=${src}&op=DOWNLOAD_MEDIA`} className="btn-secondary btn-sm">🖼 Download media</Link>
            <Link href={`/control?source=${src}&op=MARK_READ`} className="btn-secondary btn-sm">✓ Mark read</Link>
            {['GROUP', 'SUPERGROUP', 'CHANNEL'].includes(chat.type) && chat.isMember && (
              <Link href={`/control?source=${src}&op=LEAVE_CHAT`} className="btn-secondary btn-sm text-red-600">🚪 Leave</Link>
            )}
            <Link href={`/control?source=${src}&op=DELETE_MESSAGES`} className="btn-secondary btn-sm text-red-600">🗑 Delete messages</Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
