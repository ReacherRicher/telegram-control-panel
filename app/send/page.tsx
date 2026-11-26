'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ChatPicker from '@/components/chats/ChatPicker';
import { Alert, ConfirmDialog, Spinner, useToast } from '@/components/ui';
import { api, formatDateTime, formatDuration } from '@/lib/client';

interface Review {
  count: number; delaySeconds: number; etaSeconds: number; scheduleAt?: string; warning?: string;
  sample: { raw: string; title: string | null; type: string | null; ok: boolean }[];
}

export default function SendPage() {
  const toast = useToast();
  const router = useRouter();
  const [text, setText] = useState('');
  const [recipients, setRecipients] = useState('');
  const [pick, setPick] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [silent, setSilent] = useState(false);
  const [noLinkPreview, setNoLinkPreview] = useState(false);
  const [parseMode, setParseMode] = useState<'' | 'md' | 'html'>('');
  const [schedule, setSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');

  const list = Array.from(new Set(recipients.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)));

  function addRecipients(items: string[]) {
    const merged = Array.from(new Set([...list, ...items.map((s) => s.trim()).filter(Boolean)]));
    setRecipients(merged.join('\n'));
  }

  async function addGroup(group: string) {
    const r = await api<string[]>(`/api/send?group=${group}`);
    if (r.ok && r.data) { addRecipients(r.data); toast(`${r.data.length} recipients added`, 'info'); }
    else toast(r.error || 'Failed', 'error');
  }

  const payload = () => ({
    text, recipients: list, delaySeconds, silent, noLinkPreview, parseMode: parseMode || undefined,
    scheduleAt: schedule && scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
  });

  async function doReview(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    const r = await api<Review>('/api/send', { body: payload() });
    setBusy(false);
    if (r.ok && r.data) setReview(r.data); else setError(r.error || 'Failed');
  }

  async function doSend() {
    setBusy(true);
    const r = await api<{ jobId: number }>('/api/send', { body: { ...payload(), confirm: true } });
    setBusy(false);
    if (r.ok && r.data) { toast(`Job #${r.data.jobId} queued`, 'success'); router.push(`/jobs/${r.data.jobId}`); }
    else { setReview(null); setError(r.error || 'Failed'); }
  }

  return (
    <DashboardLayout title="Send & Broadcast" subtitle="Send a message to one chat or many, now or scheduled">
      <form className="max-w-4xl space-y-4" onSubmit={doReview}>
        {error && <Alert kind="error">{error}</Alert>}

        <div className="card space-y-3">
          <h2 className="card-title">Message</h2>
          <textarea className="input min-h-[160px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={4096} required dir="auto" placeholder="Type your message…" aria-label="Message text" />
          <div className="flex flex-wrap gap-4 items-center text-sm text-slate-600">
            <label className="flex items-center gap-2">Formatting
              <select className="select w-auto py-1" value={parseMode} onChange={(e) => setParseMode(e.target.value as '' | 'md' | 'html')}>
                <option value="">Plain text</option><option value="md">Markdown</option><option value="html">HTML</option>
              </select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} /> Send silently (no notification)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={noLinkPreview} onChange={(e) => setNoLinkPreview(e.target.checked)} /> Disable link preview</label>
            <span className="ml-auto text-xs text-slate-400 tabular-nums">{text.length}/4096</span>
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="card-title">Recipients <span className="text-slate-400 font-normal">({list.length})</span></h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1"><ChatPicker value={pick} onChange={setPick} placeholder="Search a chat or type @username / link…" /></div>
            <button type="button" className="btn-secondary" disabled={!pick.trim()} onClick={() => { addRecipients([pick]); setPick(''); }}>Add</button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-slate-500">Add all synced:</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => addGroup('contacts')}>Private chats</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => addGroup('groups')}>Groups</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => addGroup('adminChannels')}>My channels (admin)</button>
            {list.length > 0 && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setRecipients('')}>Clear</button>}
          </div>
          <textarea className="input min-h-[120px] font-mono text-sm" value={recipients} onChange={(e) => setRecipients(e.target.value)} dir="ltr"
            placeholder={'One per line: @username, t.me/link, chat ID, or "me" for Saved Messages'} aria-label="Recipients" />
        </div>

        <div className="card space-y-3">
          <h2 className="card-title">Delivery</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="delay">Delay between recipients (seconds)</label>
              <input id="delay" type="number" className="input" min={list.length > 1 ? 2 : 0} max={120} value={delaySeconds} onChange={(e) => setDelaySeconds(parseInt(e.target.value, 10) || 0)} />
              <p className="text-xs text-slate-500 mt-1">At least 2 s for more than one recipient. Higher is safer against Telegram flood limits.</p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1"><input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} /> Schedule for later</label>
              {schedule && <input type="datetime-local" className="input" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} required aria-label="Send at" />}
              <p className="text-xs text-slate-500 mt-1">Scheduled messages are stored by Telegram and delivered even if this server is offline.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy || !text.trim() || !list.length}>{busy && !review ? <><Spinner /> Checking…</> : 'Review & send'}</button>
        </div>
      </form>

      <ConfirmDialog open={!!review} busy={busy} onClose={() => setReview(null)} onConfirm={doSend}
        title={review?.scheduleAt ? 'Schedule this message?' : 'Send this message?'}
        confirmLabel={review?.scheduleAt ? `Schedule for ${review.count}` : `Send to ${review?.count}`}
        requireText={review && review.count > 20 ? 'SEND' : undefined}>
        {review && (
          <>
            <p><b>{review.count}</b> recipient(s){review.count > 1 && <>, {review.delaySeconds}s apart (about {formatDuration(review.etaSeconds)})</>}.</p>
            {review.scheduleAt && <p>Delivery: <b>{formatDateTime(review.scheduleAt)}</b></p>}
            <ul className="text-xs space-y-0.5">
              {review.sample.map((s) => (
                <li key={s.raw} className={s.ok ? '' : 'text-red-600'}>{s.ok ? '✓' : '✕'} {s.raw}{s.title ? ` — ${s.title}` : ' — not found'}</li>
              ))}
              {review.count > review.sample.length && <li className="text-slate-400">…and {review.count - review.sample.length} more</li>}
            </ul>
            {review.warning && <Alert kind="warning">{review.warning}</Alert>}
          </>
        )}
      </ConfirmDialog>
    </DashboardLayout>
  );
}
