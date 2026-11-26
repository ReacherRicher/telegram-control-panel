'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ChatPicker from '@/components/chats/ChatPicker';
import { Alert, ConfirmDialog, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';
import { CHAT_TYPES } from '@/lib/labels';

type Op =
  | 'FORWARD_MESSAGES' | 'FORWARD_AND_DELETE' | 'DOWNLOAD_MEDIA' | 'EXPORT_MESSAGES' | 'DELETE_MESSAGES'
  | 'INDEX_MESSAGES' | 'JOIN_CHAT' | 'LEAVE_CHAT' | 'MARK_READ';
type BulkOp = 'LEAVE_ALL_GROUPS' | 'LEAVE_ALL_CHANNELS' | 'DELETE_ALL_PRIVATE_CHATS';

const OPS: { value: Op; icon: string; title: string; desc: string; danger?: boolean }[] = [
  { value: 'FORWARD_MESSAGES', icon: '↪', title: 'Forward', desc: 'Copy messages from one chat to another, in original order' },
  { value: 'FORWARD_AND_DELETE', icon: '🧹', title: 'Forward & clean up', desc: 'Forward, then remove the copies from your own view of the destination' },
  { value: 'EXPORT_MESSAGES', icon: '⇩', title: 'Export', desc: 'Save chat history as JSON, CSV, TXT or HTML' },
  { value: 'DOWNLOAD_MEDIA', icon: '🖼', title: 'Download media', desc: 'Save photos, videos and files to the server' },
  { value: 'INDEX_MESSAGES', icon: '🔍', title: 'Index', desc: 'Store messages locally for search, stats and links' },
  { value: 'JOIN_CHAT', icon: '➕', title: 'Join', desc: 'Join a public chat or an invite link' },
  { value: 'LEAVE_CHAT', icon: '🚪', title: 'Leave', desc: 'Leave a group or channel', danger: true },
  { value: 'MARK_READ', icon: '✓', title: 'Mark as read', desc: 'Clear the unread counter of a chat' },
  { value: 'DELETE_MESSAGES', icon: '🗑', title: 'Delete messages', desc: 'Delete messages in a chat (optionally filtered)', danger: true },
];

const CONTENT_FILTERS = [
  { value: 'ALL', label: 'Everything' }, { value: 'PHOTOS', label: 'Photos' }, { value: 'VIDEOS', label: 'Videos' },
  { value: 'DOCUMENTS', label: 'Files' }, { value: 'AUDIO', label: 'Music' }, { value: 'VOICE', label: 'Voice' },
  { value: 'GIFS', label: 'GIFs' }, { value: 'STICKERS', label: 'Stickers' }, { value: 'TEXT', label: 'Text only' },
  { value: 'LINKS', label: 'With links' },
];
const MEDIA_FILTERS = CONTENT_FILTERS.filter((f) => !['TEXT', 'LINKS'].includes(f.value));

interface ChatInfo { telegramId: string; title: string; username?: string; type: string; isChannel?: boolean; isAdmin?: boolean }
interface ReviewData {
  operation: Op; source: ChatInfo; destination: ChatInfo | null; contentFilter: string;
  estimatedCount: number; exact?: boolean; dateFrom?: string | null; dateTo?: string | null;
  format?: string; deletionMode?: string; dropAuthor?: boolean; warning?: string;
}

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

function ChatBadge({ c }: { c: ChatInfo }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{CHAT_TYPES[c.type]?.icon || '💬'}</span>
      <span className="font-medium" dir="auto">{c.title || c.telegramId}</span>
      {c.username && <span className="text-slate-400">@{c.username}</span>}
    </span>
  );
}

function ControlForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  const initialOp = (OPS.find((o) => o.value === searchParams.get('op'))?.value || 'FORWARD_MESSAGES') as Op;
  const [operation, setOperation] = useState<Op>(initialOp);
  const [source, setSource] = useState(searchParams.get('source') || '');
  const [destination, setDestination] = useState('');
  const [contentFilter, setContentFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState('HTML');
  const [deletionMode, setDeletionMode] = useState('FOR_ME');
  const [dropAuthor, setDropAuthor] = useState(false);

  const [review, setReview] = useState<ReviewData | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const op = OPS.find((o) => o.value === operation)!;
  const needsDestination = operation === 'FORWARD_MESSAGES' || operation === 'FORWARD_AND_DELETE';
  const needsContent = ['FORWARD_MESSAGES', 'FORWARD_AND_DELETE', 'EXPORT_MESSAGES', 'DOWNLOAD_MEDIA', 'DELETE_MESSAGES'].includes(operation);
  const needsDates = needsContent || operation === 'INDEX_MESSAGES';
  const isDestructive = operation === 'DELETE_MESSAGES' || operation === 'LEAVE_CHAT';
  const filters = operation === 'DOWNLOAD_MEDIA' ? MEDIA_FILTERS : CONTENT_FILTERS;

  const payload = () => ({
    operation,
    source,
    destination: needsDestination ? destination : undefined,
    contentFilter: needsContent ? contentFilter : undefined,
    dateFrom: needsDates ? dateFrom || undefined : undefined,
    dateTo: needsDates ? dateTo || undefined : undefined,
    format: operation === 'EXPORT_MESSAGES' ? format : undefined,
    deletionMode: operation === 'DELETE_MESSAGES' ? deletionMode : undefined,
    dropAuthor: needsDestination ? dropAuthor : undefined,
  });

  const invalidate = () => { setReview(null); setError(''); };

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setReviewing(true); setError(''); setReview(null);
    const r = await api<ReviewData>('/api/control', { body: { ...payload(), confirm: false } });
    setReviewing(false);
    if (r.ok && r.data) setReview(r.data); else setError(r.error || 'Review failed');
  }

  async function execute() {
    setExecuting(true); setError('');
    const r = await api<{ jobId: number }>('/api/control', { body: { ...payload(), confirm: true } });
    setExecuting(false);
    if (r.ok && r.data) { toast(`Job #${r.data.jobId} queued`, 'success'); router.push(`/jobs/${r.data.jobId}`); }
    else { setConfirmOpen(false); setError(r.error || 'Could not start the job'); }
  }

  function preset(days: number | null) {
    invalidate();
    if (days === null) { setDateFrom(''); setDateTo(''); return; }
    const to = new Date(); const from = new Date(Date.now() - days * 86400000);
    setDateFrom(isoDay(from)); setDateTo(isoDay(to));
  }

  return (
    <div className="space-y-6">
      {/* Operation picker */}
      <section>
        <h2 className="card-title mb-3">1. Choose an operation</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {OPS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={operation === o.value}
              onClick={() => { setOperation(o.value); invalidate(); if (o.value === 'DOWNLOAD_MEDIA' && ['TEXT', 'LINKS'].includes(contentFilter)) setContentFilter('ALL'); }}
              className={`text-left rounded-lg border p-3 transition flex gap-3 ${operation === o.value
                ? (o.danger ? 'border-red-400 bg-red-50 ring-1 ring-red-400' : 'border-sky-500 bg-sky-50 ring-1 ring-sky-500')
                : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <span className="text-xl w-6 text-center">{o.icon}</span>
              <span>
                <span className={`block font-medium text-sm ${o.danger ? 'text-red-700' : 'text-slate-800'}`}>{o.title}</span>
                <span className="block text-xs text-slate-500">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Form */}
      <form onSubmit={handleReview} className="card space-y-4">
        <h2 className="card-title">2. Details — {op.title}</h2>

        <div className={needsDestination ? 'grid md:grid-cols-2 gap-4' : ''}>
          <div>
            <label className="label" htmlFor="src">{operation === 'JOIN_CHAT' ? 'Chat to join' : needsDestination ? 'From (source)' : 'Chat'}</label>
            <ChatPicker id="src" value={source} onChange={(v) => { setSource(v); invalidate(); }} required
              placeholder={operation === 'JOIN_CHAT' ? '@username or https://t.me/+invite' : undefined}
              types={operation === 'LEAVE_CHAT' ? 'groupsAndChannels' : undefined} />
          </div>
          {needsDestination && (
            <div>
              <label className="label" htmlFor="dst">To (destination)</label>
              <ChatPicker id="dst" value={destination} onChange={(v) => { setDestination(v); invalidate(); }} required placeholder="@username, “me” for Saved Messages, or search…" />
            </div>
          )}
        </div>

        {needsContent && (
          <div>
            <span className="label">Content</span>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button key={f.value} type="button" aria-pressed={contentFilter === f.value}
                  onClick={() => { setContentFilter(f.value); invalidate(); }}
                  className={`px-3 py-1 rounded-full text-sm border ${contentFilter === f.value ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {needsDates && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="label mb-0">Date range <span className="normal-case text-slate-400">(optional)</span></span>
              <div className="flex gap-1 text-xs">
                <button type="button" className="text-sky-600 hover:underline" onClick={() => preset(7)}>7 days</button>·
                <button type="button" className="text-sky-600 hover:underline" onClick={() => preset(30)}>30 days</button>·
                <button type="button" className="text-sky-600 hover:underline" onClick={() => preset(365)}>1 year</button>·
                <button type="button" className="text-slate-500 hover:underline" onClick={() => preset(null)}>All time</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="input" aria-label="From date" value={dateFrom} max={dateTo || undefined} onChange={(e) => { setDateFrom(e.target.value); invalidate(); }} />
              <input type="date" className="input" aria-label="To date" value={dateTo} min={dateFrom || undefined} onChange={(e) => { setDateTo(e.target.value); invalidate(); }} />
            </div>
            <p className="help">Both days are included.</p>
          </div>
        )}

        {operation === 'EXPORT_MESSAGES' && (
          <div>
            <span className="label">Format</span>
            <div className="segmented">
              {['HTML', 'JSON', 'CSV', 'TXT'].map((f) => (
                <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>{f}</button>
              ))}
            </div>
            <p className="help">HTML is easiest to read; CSV opens in Excel (Persian text supported).</p>
          </div>
        )}

        {needsDestination && (
          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={dropAuthor} onChange={(e) => { setDropAuthor(e.target.checked); invalidate(); }} />
            <span>Hide “Forwarded from” <span className="text-slate-400">— send as a copy without the original sender</span></span>
          </label>
        )}

        {operation === 'DELETE_MESSAGES' && (
          <div>
            <span className="label">Delete for</span>
            <div className="segmented">
              <button type="button" aria-pressed={deletionMode === 'FOR_ME'} onClick={() => { setDeletionMode('FOR_ME'); invalidate(); }}>Only me</button>
              <button type="button" aria-pressed={deletionMode === 'FOR_EVERYONE'} onClick={() => { setDeletionMode('FOR_EVERYONE'); invalidate(); }}>Everyone (if allowed)</button>
            </div>
          </div>
        )}

        {error && <Alert kind="error">{error}</Alert>}

        <div className="flex justify-end">
          <button type="submit" disabled={reviewing || !source || (needsDestination && !destination)} className="btn-primary">
            {reviewing ? <><Spinner /> Checking…</> : 'Review →'}
          </button>
        </div>
      </form>

      {/* Review */}
      {review && (
        <section className={`card border-2 ${isDestructive ? 'border-red-300' : 'border-sky-300'}`}>
          <h2 className="card-title mb-4">3. Review &amp; start</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm mb-4">
            <dt className="text-slate-500">Operation</dt><dd className="font-medium">{op.title}</dd>
            <dt className="text-slate-500">{needsDestination ? 'From' : 'Chat'}</dt><dd><ChatBadge c={review.source} /></dd>
            {review.destination && <><dt className="text-slate-500">To</dt><dd><ChatBadge c={review.destination} /></dd></>}
            {needsContent && <><dt className="text-slate-500">Content</dt><dd>{CONTENT_FILTERS.find((f) => f.value === review.contentFilter)?.label}</dd></>}
            {(review.dateFrom || review.dateTo) && <><dt className="text-slate-500">Dates</dt><dd>{review.dateFrom || 'beginning'} → {review.dateTo || 'today'}</dd></>}
            {review.format && operation === 'EXPORT_MESSAGES' && <><dt className="text-slate-500">Format</dt><dd>{review.format}</dd></>}
            {needsDestination && <><dt className="text-slate-500">Header</dt><dd>{review.dropAuthor ? 'Hidden (sent as copies)' : 'Shows “Forwarded from”'}</dd></>}
            {operation === 'DELETE_MESSAGES' && <><dt className="text-slate-500">Delete for</dt><dd>{review.deletionMode === 'FOR_EVERYONE' ? 'Everyone' : 'Only me'}</dd></>}
            {review.estimatedCount > 0 && (
              <><dt className="text-slate-500">Messages</dt>
                <dd className="font-semibold text-sky-700 tabular-nums">
                  {review.exact ? '' : '≈ '}{review.estimatedCount.toLocaleString()}
                  {!review.exact && <span className="font-normal text-xs text-slate-400 ml-2">{needsContent && review.contentFilter !== 'ALL' ? 'total in chat (index the chat for an exact count)' : 'estimate'}</span>}
                </dd></>
            )}
          </dl>

          {review.warning && <Alert kind="warning" className="mb-4">⚠ {review.warning}</Alert>}

          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setReview(null)}>Edit</button>
            <button className={isDestructive ? 'btn-danger' : 'btn-primary'} onClick={() => (isDestructive ? setConfirmOpen(true) : execute())} disabled={executing}>
              {executing ? <><Spinner /> Starting…</> : `Start ${op.title.toLowerCase()}`}
            </button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmOpen} danger requireText="DELETE" busy={executing}
        title={operation === 'LEAVE_CHAT' ? 'Leave this chat?' : 'Delete these messages?'}
        confirmLabel={operation === 'LEAVE_CHAT' ? 'Leave chat' : 'Delete messages'}
        onClose={() => setConfirmOpen(false)} onConfirm={execute}
      >
        {review && <p>{operation === 'LEAVE_CHAT' ? <>You will leave <b dir="auto">{review.source.title}</b>.</> : <>Up to <b>{review.estimatedCount.toLocaleString()}</b> messages in <b dir="auto">{review.source.title}</b> will be deleted. This cannot be undone.</>}</p>}
      </ConfirmDialog>
    </div>
  );
}

const BULK: { op: BulkOp; title: string; desc: string }[] = [
  { op: 'LEAVE_ALL_GROUPS', title: 'Leave all groups', desc: 'Leave every group and supergroup you are a member of' },
  { op: 'LEAVE_ALL_CHANNELS', title: 'Leave all channels', desc: 'Unsubscribe from every channel' },
  { op: 'DELETE_ALL_PRIVATE_CHATS', title: 'Delete all private chats', desc: 'Clear the history of every private and bot chat' },
];

function DangerZone() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deletionMode, setDeletionMode] = useState('FOR_ME');
  const [loadingOp, setLoadingOp] = useState<BulkOp | null>(null);
  const [review, setReview] = useState<{ operation: BulkOp; estimatedCount: number; label: string; sample: { title?: string; username?: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function startReview(op: BulkOp) {
    setLoadingOp(op);
    const r = await api<typeof review>('/api/control', { body: { operation: op, deletionMode, confirm: false } });
    setLoadingOp(null);
    if (r.ok && r.data) setReview({ ...r.data, operation: op }); else toast(r.error || 'Review failed', 'error');
  }

  async function execute() {
    if (!review) return;
    setBusy(true);
    const r = await api<{ jobId: number }>('/api/control', { body: { operation: review.operation, deletionMode, confirm: true } });
    setBusy(false);
    if (r.ok && r.data) router.push(`/jobs/${r.data.jobId}`); else { toast(r.error || 'Failed', 'error'); setReview(null); }
  }

  return (
    <section className="card border-red-200">
      <button type="button" className="w-full flex items-center justify-between text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <span className="block font-semibold text-red-700">Danger zone — bulk operations</span>
          <span className="block text-xs text-slate-500">Act on all chats of a type at once</span>
        </span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {BULK.map((b) => (
            <div key={b.op} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-slate-200">
              <div className="flex-1">
                <div className="font-medium text-sm text-slate-800">{b.title}</div>
                <div className="text-xs text-slate-500">{b.desc}</div>
                {b.op === 'DELETE_ALL_PRIVATE_CHATS' && (
                  <div className="segmented mt-2">
                    <button type="button" aria-pressed={deletionMode === 'FOR_ME'} onClick={() => setDeletionMode('FOR_ME')}>Only me</button>
                    <button type="button" aria-pressed={deletionMode === 'FOR_EVERYONE'} onClick={() => setDeletionMode('FOR_EVERYONE')}>Everyone</button>
                  </div>
                )}
              </div>
              <button className="btn-danger btn-sm" onClick={() => startReview(b.op)} disabled={!!loadingOp}>
                {loadingOp === b.op ? <><Spinner /> Checking…</> : 'Review…'}
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!review} danger requireText="DELETE" busy={busy}
        title={BULK.find((b) => b.op === review?.operation)?.title + '?'}
        confirmLabel="Start" onClose={() => setReview(null)} onConfirm={execute}
      >
        {review && (
          <>
            <p><b>{review.estimatedCount.toLocaleString()}</b> {review.label}.</p>
            {review.sample.length > 0 && (
              <ul className="text-xs text-slate-500 list-disc list-inside max-h-32 overflow-auto">
                {review.sample.map((s, i) => <li key={i} dir="auto">{s.title || s.username}</li>)}
                {review.estimatedCount > review.sample.length && <li>…and {review.estimatedCount - review.sample.length} more</li>}
              </ul>
            )}
            <p className="text-red-600">This cannot be undone. The list comes from your last Sync.</p>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}

export default function ControlPage() {
  return (
    <DashboardLayout title="Operations" subtitle="Every operation runs as a background job you can pause, resume or cancel">
      <div className="max-w-4xl space-y-6">
        <Suspense fallback={<div className="text-slate-400 text-sm">Loading…</div>}>
          <ControlForm />
        </Suspense>
        <DangerZone />
      </div>
    </DashboardLayout>
  );
}
