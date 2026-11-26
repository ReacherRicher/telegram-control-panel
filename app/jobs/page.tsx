'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { EmptyState, Pagination, ProgressBar, Spinner, useToast } from '@/components/ui';
import { api, timeAgo } from '@/lib/client';
import { ACTIVE_STATUSES, JOB_LABELS, JOB_STATUS } from '@/lib/labels';

interface Job {
  id: number; type: string; status: string; sourceChatRaw?: string; destinationChatRaw?: string;
  totalItems: number; processedItems: number; failedItems: number;
  createdAt: string; completedAt?: string; error?: string;
  sourceChat?: { title?: string; username?: string } | null;
  destChat?: { title?: string; username?: string } | null;
}

const FILTERS = [
  { value: '', label: 'All' }, { value: 'RUNNING', label: 'Running' }, { value: 'QUEUED', label: 'Queued' },
  { value: 'PAUSED', label: 'Paused' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function JobsPage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '25', status });
    const r = await api<Job[]>(`/api/jobs?${params}`);
    if (r.ok && r.data) { setJobs(r.data); setTotal(r.json.total || 0); }
  }, [page, status]);

  const hasActive = !!jobs?.some((j) => ACTIVE_STATUSES.includes(j.status));
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, hasActive ? 3000 : 15000);
    return () => clearInterval(t);
  }, [load, hasActive]);

  async function act(jobId: number, action: string) {
    const r = action === 'delete'
      ? await api(`/api/jobs/${jobId}`, { method: 'DELETE' })
      : await api(`/api/jobs/${jobId}`, { method: 'PATCH', body: { action } });
    if (!r.ok) toast(r.error || 'Failed', 'error');
    load();
  }

  const chatName = (c?: { title?: string; username?: string } | null, raw?: string) => c?.title || (c?.username ? `@${c.username}` : raw) || '';

  return (
    <DashboardLayout title="Jobs" subtitle={`${total.toLocaleString()} job${total === 1 ? '' : 's'}`}>
      <div className="space-y-4 max-w-6xl">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.value} aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }}
              className={`px-3 py-1 rounded-full text-sm border ${status === f.value ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Job</th><th>Chats</th><th className="w-56">Progress</th><th>Status</th><th>Created</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {jobs === null && <tr><td colSpan={6} className="text-center py-8 text-slate-400"><Spinner /> Loading…</td></tr>}
              {jobs?.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon="⟳" title="No jobs here">Start one from <Link href="/control" className="text-sky-600 hover:underline">Operations</Link>.</EmptyState></td></tr>
              )}
              {jobs?.map((j) => {
                const src = chatName(j.sourceChat, j.sourceChatRaw);
                const dst = chatName(j.destChat, j.destinationChatRaw);
                return (
                  <tr key={j.id}>
                    <td>
                      <Link href={`/jobs/${j.id}`} className="font-medium text-slate-800 hover:text-sky-600">{JOB_LABELS[j.type] || j.type}</Link>
                      <div className="text-xs text-slate-400 font-mono">#{j.id}</div>
                    </td>
                    <td className="text-xs text-slate-600 max-w-[16rem]">
                      {src && <div className="truncate" dir="auto">{src}</div>}
                      {dst && <div className="truncate text-slate-400" dir="auto">→ {dst}</div>}
                      {!src && !dst && '—'}
                    </td>
                    <td>
                      <div className="text-xs text-slate-600 mb-1 tabular-nums">
                        {j.processedItems.toLocaleString()}{j.totalItems > 0 ? ` / ${j.totalItems.toLocaleString()}` : ''}
                        {j.failedItems > 0 && <span className="text-red-600 ml-2">{j.failedItems} failed</span>}
                      </div>
                      {(j.totalItems > 0 || j.status === 'RUNNING') && <ProgressBar value={j.processedItems + j.failedItems} max={j.totalItems} status={j.status} />}
                    </td>
                    <td><span className={JOB_STATUS[j.status]?.badge || 'badge-gray'} title={j.error || ''}>{JOB_STATUS[j.status]?.label || j.status}</span></td>
                    <td className="text-xs text-slate-500 whitespace-nowrap" title={new Date(j.createdAt).toLocaleString()}>{timeAgo(j.createdAt)}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        {j.status === 'RUNNING' && <button className="btn-secondary btn-sm" onClick={() => act(j.id, 'pause')}>Pause</button>}
                        {j.status === 'PAUSED' && <button className="btn-success btn-sm" onClick={() => act(j.id, 'resume')}>Resume</button>}
                        {ACTIVE_STATUSES.includes(j.status) && <button className="btn-ghost btn-sm text-red-600" onClick={() => { if (confirm(`Cancel job #${j.id}?`)) act(j.id, 'cancel'); }}>Cancel</button>}
                        {['FAILED', 'CANCELLED'].includes(j.status) && <button className="btn-secondary btn-sm" onClick={() => act(j.id, 'retry')}>Retry</button>}
                        {j.status === 'COMPLETED' && j.type === 'EXPORT_MESSAGES' && <a href={`/api/export/${j.id}`} className="btn-success btn-sm">⇩ File</a>}
                        {!ACTIVE_STATUSES.includes(j.status) && <button className="btn-ghost btn-sm text-slate-400" title="Delete from history" onClick={() => { if (confirm(`Remove job #${j.id} from history?`)) act(j.id, 'delete'); }}>✕</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={Math.ceil(total / 25)} onChange={setPage} />
      </div>
    </DashboardLayout>
  );
}
