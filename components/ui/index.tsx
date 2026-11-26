'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// ── Toasts ───────────────────────────────────────────────────────────────────
type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`px-4 py-3 rounded-lg shadow-lg text-sm border animate-in ${
              t.kind === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : t.kind === 'error' ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {t.kind === 'success' ? '✓ ' : t.kind === 'error' ? '⚠ ' : ''}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ── Small building blocks ────────────────────────────────────────────────────
export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px] ${className}`} aria-hidden />;
}

export function EmptyState({ icon = '📭', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="font-medium text-slate-700">{title}</div>
      {children && <div className="text-sm text-slate-500 mt-1">{children}</div>}
    </div>
  );
}

export function Alert({ kind = 'info', children, className = '' }: { kind?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode; className?: string }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[kind];
  return <div className={`px-3 py-2.5 border rounded-lg text-sm ${styles} ${className}`}>{children}</div>;
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2 justify-end">
      <button className="btn-secondary btn-sm" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>← Prev</button>
      <span className="text-sm text-slate-500 tabular-nums">Page {page} of {totalPages}</span>
      <button className="btn-secondary btn-sm" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Next →</button>
    </div>
  );
}

export function ProgressBar({ value, max, status }: { value: number; max: number; status?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = status === 'FAILED' ? 'bg-red-500' : status === 'COMPLETED' ? 'bg-emerald-500' : status === 'PAUSED' ? 'bg-amber-500' : 'bg-blue-500';
  const indeterminate = max <= 0 && status === 'RUNNING';
  return (
    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      {indeterminate
        ? <div className="h-2 w-1/3 bg-blue-500 rounded-full animate-indeterminate" />
        : <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />}
    </div>
  );
}

/** Modal confirm for destructive actions. Optionally requires typing a word. */
export function ConfirmDialog({
  open, title, children, confirmLabel = 'Confirm', danger = false, requireText, busy = false, onConfirm, onClose,
}: {
  open: boolean; title: string; children?: ReactNode; confirmLabel?: string; danger?: boolean; requireText?: string;
  busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  const canConfirm = !busy && (!requireText || typed.trim().toUpperCase() === requireText);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className={`text-lg font-semibold ${danger ? 'text-red-700' : 'text-slate-800'}`}>{title}</h2>
        {children && <div className="text-sm text-slate-600 space-y-2">{children}</div>}
        {requireText && (
          <div>
            <label className="label">Type <code className="font-bold text-red-600">{requireText}</code> to confirm</label>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus placeholder={requireText} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={!canConfirm}>
            {busy ? <><Spinner /> Working…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, href, tone = 'slate' }: { label: string; value: ReactNode; hint?: string; href?: string; tone?: 'slate' | 'blue' | 'green' | 'red' | 'amber' }) {
  const toneCls = { slate: 'text-slate-800', blue: 'text-blue-600', green: 'text-emerald-600', red: 'text-red-600', amber: 'text-amber-600' }[tone];
  const inner = (
    <>
      <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </>
  );
  return href
    ? <a href={href} className="stat-card hover:border-blue-300 hover:shadow transition">{inner}</a>
    : <div className="stat-card">{inner}</div>;
}
