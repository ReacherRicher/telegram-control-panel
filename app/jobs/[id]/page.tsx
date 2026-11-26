'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Alert, ConfirmDialog, ProgressBar, Spinner, useToast } from '@/components/ui';
import { api, formatDateTime, formatDuration } from '@/lib/client';
import { ACTIVE_STATUSES, JOB_LABELS, JOB_STATUS } from '@/lib/labels';

interface JobDetail {
  id: number; type: string; status: string; sourceChatRaw?: string; destinationChatRaw?: string;
  contentFilter?: string; formatOption?: string; deletionMode?: string; dateFrom?: string; dateTo?: string;
  totalItems: number; processedItems: number; failedItems: number;
  startedAt?: string; completedAt?: string; createdAt: string; error?: string; note?: string; outputPath?: string;
  sourceChat?: { id: number; title?: string; username?: string } | null;
  destChat?: { id: number; title?: string; username?: string } | null;
  items: Array<{ id: number; telegramMessageId?: number; status: string; error?: string; processedAt?: string }>;
}

export default function JobDetailPage() {
  const params = useParams();
  const toast = useToast();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const samples = useRef<{ t: number; n: number }[]>([]);

  const load = useCallback(async () => {
    const r = await api<JobDetail>(`/api/jobs/${params.id}`);
    if (r.ok && r.data) {
      setJob(r.data);
      const n = r.data.processedItems + r.data.failedItems;
      samples.current = [...samples.current.filter((s) => Date.now() - s.t < 60000), { t: Date.now(), n }];
    } else if (r.status === 404) setNotFound(true);
  }, [params.id]);

  const active = job ? ACTIVE_STATUSES.includes(job.status) : true;
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load, active]);

  async function act(action: string) {
    setBusy(true);
    const r = await api(`/api/jobs/${params.id}`, { method: 'PATCH', body: { action } });
    setBusy(false);
    setConfirmCancel(false);
    if (!r.ok) toast(r.error || 'Failed', 'error'); else toast(`Job ${action === 'retry' ? 'queued again' : action + 'd'}`, 'success');
    load();
  }

  if (notFound) return <DashboardLayout title="Job"><Alert kind="error">Job not found. <Link href="/jobs" className="underline">Back to jobs</Link></Alert></DashboardLayout>;
  if (!job) return <DashboardLayout title="Job"><div className="text-slate-400 flex items-center gap-2"><Spinner /> Loading…</div></DashboardLayout>;

  const done = job.processedItems + job.failedItems;
  const pct = job.totalItems > 0 ? Math.min(100, (done / job.totalItems) * 100) : null;
  const s = samples.current;
  const rate = s.length >= 2 ? (s[s.length - 1].n - s[0].n) / ((s[s.length - 1].t - s[0].t) / 1000) : 0;
  const eta = job.status === 'RUNNING' && rate > 0 && job.totalItems > done ? (job.totalItems - done) / rate : null;
  const elapsed = job.startedAt ? ((job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime()) / 1000 : null;
  const chat = (c?: { title?: string; username?: string } | null, raw?: string) =>
    c?.title ? <span><bdi>{c.title}</bdi>{c.username && <span className="text-slate-400"> @{c.username}</span>}</span> : raw || '—';

  return (
    <DashboardLayout
      title={<>{JOB_LABELS[job.type] || job.type} <span className="text-slate-400 font-normal">#{job.id}</span></>}
      actions={<Link href="/jobs" className="btn-ghost btn-sm">← All jobs</Link>}
    >
      <div className="max-w-3xl space-y-4">
        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${JOB_STATUS[job.status]?.dot}`} />
            <span className="text-lg font-semibold text-slate-800">{JOB_STATUS[job.status]?.label || job.status}</span>
            {job.status === 'QUEUED' && <span className="text-sm text-slate-500">— waiting for the worker…</span>}
            {job.status === 'PAUSED' && <span className="text-sm text-slate-500">— progress is saved, resume any time</span>}
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-end justify-between text-sm mb-1.5">
              <span className="text-slate-600 tabular-nums">
                <b className="text-slate-800 text-base">{job.processedItems.toLocaleString()}</b>
                {job.totalItems > 0 && <> / {job.totalItems.toLocaleString()}</>} done
                {job.failedItems > 0 && <span className="text-red-600 ml-2">· {job.failedItems.toLocaleString()} failed</span>}
              </span>
              <span className="text-slate-500 tabular-nums text-xs">
                {pct !== null && `${pct.toFixed(1)}%`}
                {job.status === 'RUNNING' && rate > 0 && ` · ${rate.toFixed(1)}/s`}
                {eta !== null && ` · ~${formatDuration(eta)} left`}
              </span>
            </div>
            <ProgressBar value={done} max={job.totalItems} status={job.status} />
          </div>

          {job.error && <Alert kind="error"><b>Error:</b> {job.error}</Alert>}
          {job.note && <Alert kind="info">{job.note}</Alert>}

          <div className="flex gap-2 flex-wrap">
            {job.status === 'RUNNING' && <button className="btn-warning" onClick={() => act('pause')} disabled={busy}>⏸ Pause</button>}
            {job.status === 'PAUSED' && <button className="btn-success" onClick={() => act('resume')} disabled={busy}>▶ Resume</button>}
            {['FAILED', 'CANCELLED'].includes(job.status) && <button className="btn-primary" onClick={() => act('retry')} disabled={busy}>↻ Retry{job.type !== 'EXPORT_MESSAGES' ? ' from checkpoint' : ''}</button>}
            {job.status === 'COMPLETED' && job.type === 'EXPORT_MESSAGES' && <a href={`/api/export/${job.id}`} className="btn-success">⇩ Download export</a>}
            {job.status === 'COMPLETED' && job.type === 'DOWNLOAD_MEDIA' && job.sourceChat && <Link href={`/media?chatId=${job.sourceChat.id}&downloaded=true`} className="btn-secondary">View downloaded files</Link>}
            {job.status === 'COMPLETED' && job.type === 'INDEX_MESSAGES' && job.sourceChat && <Link href={`/messages?chatId=${job.sourceChat.id}`} className="btn-secondary">Browse messages</Link>}
            {ACTIVE_STATUSES.includes(job.status) && <button className="btn-ghost text-red-600 hover:bg-red-50 ml-auto" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel job</button>}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Details</h3>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            {(job.sourceChat || job.sourceChatRaw) && <><dt className="text-slate-500">Source</dt><dd>{chat(job.sourceChat, job.sourceChatRaw)}</dd></>}
            {(job.destChat || job.destinationChatRaw) && <><dt className="text-slate-500">Destination</dt><dd>{chat(job.destChat, job.destinationChatRaw)}</dd></>}
            {job.contentFilter && job.contentFilter !== 'ALL' && <><dt className="text-slate-500">Content</dt><dd>{job.contentFilter}</dd></>}
            {(job.dateFrom || job.dateTo) && <><dt className="text-slate-500">Dates</dt><dd>{job.dateFrom ? new Date(job.dateFrom).toLocaleDateString() : 'beginning'} → {job.dateTo ? new Date(job.dateTo).toLocaleDateString() : 'now'}</dd></>}
            {job.formatOption && <><dt className="text-slate-500">Format</dt><dd>{job.formatOption}</dd></>}
            {job.deletionMode && <><dt className="text-slate-500">Delete for</dt><dd>{job.deletionMode === 'FOR_EVERYONE' ? 'Everyone' : 'Only me'}</dd></>}
            <dt className="text-slate-500">Created</dt><dd>{formatDateTime(job.createdAt)}</dd>
            {job.startedAt && <><dt className="text-slate-500">Started</dt><dd>{formatDateTime(job.startedAt)}</dd></>}
            {job.completedAt && <><dt className="text-slate-500">Finished</dt><dd>{formatDateTime(job.completedAt)}</dd></>}
            {elapsed !== null && <><dt className="text-slate-500">Duration</dt><dd>{formatDuration(elapsed)}</dd></>}
          </dl>
        </div>

        {job.items.length > 0 && (
          <div className="card">
            <h3 className="card-title mb-3">Problems ({job.items.length}{job.items.length >= 200 ? '+' : ''})</h3>
            <div className="space-y-1 max-h-80 overflow-y-auto text-xs">
              {job.items.map((item) => (
                <div key={item.id} className={`p-2 rounded border ${item.status === 'SKIPPED' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
                  {item.telegramMessageId ? <span className="font-mono text-slate-500 mr-2">msg {item.telegramMessageId}</span> : null}
                  <span className={item.status === 'SKIPPED' ? 'text-amber-800' : 'text-red-700'} dir="auto">{item.error || item.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmCancel} danger busy={busy} title={`Cancel job #${job.id}?`} confirmLabel="Cancel job"
        onClose={() => setConfirmCancel(false)} onConfirm={() => act('cancel')}>
        <p>Work already done stays done. You can retry later and it continues from the last checkpoint.</p>
      </ConfirmDialog>
    </DashboardLayout>
  );
}
