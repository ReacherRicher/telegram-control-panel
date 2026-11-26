'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ConfirmDialog, EmptyState, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/client';

interface Account {
  id: number; slug: string; label: string; phone?: string; telegramId?: string;
  firstName?: string; lastName?: string; username?: string; isPremium: boolean;
  sessionExists: boolean; isSelected: boolean;
  _count: { chats: number; contacts: number; jobs: number };
}

type Step = 'phone' | 'code' | '2fa' | 'done';

function LoginWizard({ initial, onClose, onDone }: {
  initial?: { slug: string; label: string; phone?: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>('phone');
  const [slug, setSlug] = useState(initial?.slug || '');
  const [label, setLabel] = useState(initial?.label || '');
  const [phone, setPhone] = useState(initial?.phone ? `+${initial.phone.replace(/^\+/, '')}` : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [codeViaApp, setCodeViaApp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; username?: string; telegramId: string } | null>(null);
  const editingExisting = !!initial;

  async function call(body: Record<string, unknown>) {
    setBusy(true); setError('');
    const r = await api<Record<string, unknown>>('/api/accounts/login', { body: { slug, ...body } });
    setBusy(false);
    if (!r.ok && r.json.restart) setStep('phone');
    return r;
  }

  async function cancel() {
    if (step !== 'phone' && step !== 'done') await api('/api/accounts/login', { body: { step: 'cancel', slug } });
    onClose();
  }

  async function sendPhone(e: React.FormEvent) {
    e.preventDefault();
    const r = await call({ step: 'phone', label, phone });
    if (r.ok) { setCodeViaApp(!!r.data?.codeViaApp); setCode(''); setStep('code'); } else setError(r.error || 'Failed to send code');
  }
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const r = await call({ step: 'code', code });
    if (!r.ok) { setError(r.error || 'Invalid code'); return; }
    if (r.data?.nextStep === '2fa') { setHint((r.data.hint as string) || null); setStep('2fa'); }
    else if (r.data?.nextStep === 'done') { setDone(r.data.account as typeof done); setStep('done'); onDone(); }
  }
  async function send2fa(e: React.FormEvent) {
    e.preventDefault();
    const r = await call({ step: '2fa', password });
    if (r.ok && r.data?.nextStep === 'done') { setDone(r.data.account as typeof done); setStep('done'); onDone(); }
    else setError(r.error || 'Wrong password');
  }

  const steps: Step[] = ['phone', 'code', '2fa'];
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        {step !== 'done' && (
          <ol className="flex items-center gap-2 mb-5 text-xs">
            {steps.map((s, i) => {
              const idx = steps.indexOf(step);
              return (
                <li key={s} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full grid place-items-center font-semibold ${i < idx ? 'bg-emerald-500 text-white' : i === idx ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i < idx ? '✓' : i + 1}</span>
                  <span className={i === idx ? 'text-slate-800 font-medium' : 'text-slate-400'}>{s === 'phone' ? 'Phone' : s === 'code' ? 'Code' : '2FA (if set)'}</span>
                  {i < steps.length - 1 && <span className="w-4 h-px bg-slate-300" />}
                </li>
              );
            })}
          </ol>
        )}

        {step === 'done' && done && (
          <div className="text-center space-y-4">
            <div className="text-4xl">✅</div>
            <h2 className="text-lg font-bold text-slate-800">Logged in</h2>
            <div className="text-sm text-slate-600 space-y-1">
              <p dir="auto" className="font-medium">{done.name}</p>
              {done.username && <p className="text-sky-600">@{done.username}</p>}
              <p className="text-xs text-slate-400 font-mono">ID {done.telegramId}</p>
            </div>
            <p className="text-sm text-slate-500">Next: select the account and run <b>Sync</b> to load your chats.</p>
            <button className="btn-primary w-full" onClick={onClose}>Close</button>
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={sendPhone} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{editingExisting ? `Log in: ${initial?.label}` : 'Add Telegram account'}</h2>
              <p className="text-sm text-slate-500">Telegram will send a login code to this number (usually inside the Telegram app).</p>
            </div>
            <div>
              <label className="label" htmlFor="w-phone">Phone number</label>
              <input id="w-phone" className="input" placeholder="+15551234567" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={busy} type="tel" autoFocus inputMode="tel" />
              <p className="help">International format with country code.</p>
            </div>
            <div>
              <label className="label" htmlFor="w-label">Display name</label>
              <input id="w-label" className="input" placeholder="e.g. Personal" value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (!editingExisting) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32));
                }}
                required disabled={busy} />
            </div>
            <div>
              <label className="label" htmlFor="w-slug">Internal ID</label>
              <input id="w-slug" className="input font-mono" placeholder="personal" value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required disabled={busy || editingExisting} minLength={2} maxLength={32} />
              <p className="help">Used for the session file name. Lowercase letters, numbers, underscore.</p>
            </div>
            {error && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1" disabled={busy || slug.length < 2}>{busy ? <><Spinner /> Sending code…</> : 'Send code →'}</button>
              <button type="button" className="btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Enter the code</h2>
              <p className="text-sm text-slate-500">
                A code was sent to <b dir="ltr">{phone}</b> {codeViaApp ? 'in your Telegram app (chat “Telegram”).' : 'by SMS.'}
              </p>
            </div>
            <input
              className="input text-2xl tracking-[0.5em] text-center font-mono" placeholder="•••••" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required disabled={busy} autoFocus inputMode="numeric" autoComplete="one-time-code" aria-label="Login code"
            />
            {error && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1" disabled={busy || code.length < 5}>{busy ? <><Spinner /> Verifying…</> : 'Verify →'}</button>
              <button type="button" className="btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>
            </div>
            <p className="text-xs text-slate-400">Never share this code with anyone. Didn’t get it? Cancel and start again in a minute.</p>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={send2fa} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Two-step verification</h2>
              <p className="text-sm text-slate-500">This account has a cloud password.{hint ? <> Hint: <b>{hint}</b></> : null}</p>
            </div>
            <input className="input" type="password" placeholder="Cloud password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} autoFocus autoComplete="current-password" />
            {error && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1" disabled={busy}>{busy ? <><Spinner /> Checking…</> : 'Log in →'}</button>
              <button type="button" className="btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; initial?: { slug: string; label: string; phone?: string } }>({ open: false });
  const [removing, setRemoving] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Account[]>('/api/accounts');
    if (r.ok && r.data) setAccounts(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function select(id: number) {
    const r = await api(`/api/accounts/${id}/select`, { method: 'POST' });
    if (r.ok) window.location.reload(); else toast(r.error || 'Failed', 'error');
  }

  async function sync(id: number) {
    setSyncing(id);
    const r = await api<{ contacts: number; dialogs: number }>(`/api/accounts/${id}`, { method: 'PATCH', body: { action: 'sync' } });
    setSyncing(null);
    if (r.ok && r.data) { toast(`Synced ${r.data.contacts} contacts and ${r.data.dialogs} chats`, 'success'); load(); }
    else toast('Sync failed: ' + r.error, 'error');
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const r = await api(`/api/accounts/${removing.id}`, { method: 'DELETE' });
    setBusy(false);
    if (r.ok) { toast('Account removed', 'success'); setRemoving(null); window.location.reload(); }
    else toast(r.error || 'Failed', 'error');
  }

  return (
    <DashboardLayout
      requireAccount={false}
      title="Telegram accounts"
      subtitle="Log in with one or more Telegram user accounts"
      actions={<button className="btn-primary btn-sm" onClick={() => setWizard({ open: true })}>+ Add account</button>}
    >
      <div className="max-w-5xl space-y-4">
        {wizard.open && <LoginWizard initial={wizard.initial} onClose={() => { setWizard({ open: false }); load(); }} onDone={load} />}

        <ConfirmDialog
          open={!!removing} danger busy={busy} title={`Remove “${removing?.label}”?`} confirmLabel="Remove account"
          onClose={() => setRemoving(null)} onConfirm={remove}
        >
          <p>The saved Telegram session on this server is deleted and the account disappears from the panel. Nothing is changed in Telegram itself.</p>
          <p className="text-xs text-slate-500">Tip: also end the session in Telegram → Settings → Devices (“TCP-{removing?.slug}”).</p>
        </ConfirmDialog>

        {accounts === null && <div className="text-sm text-slate-400 flex items-center gap-2"><Spinner /> Loading…</div>}

        {accounts?.length === 0 && (
          <div className="card">
            <EmptyState icon="👋" title="No accounts yet">
              Add your first Telegram account to get started.
              <div className="mt-4"><button className="btn-primary" onClick={() => setWizard({ open: true })}>+ Add account</button></div>
            </EmptyState>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {accounts?.map((acc) => {
            const name = [acc.firstName, acc.lastName].filter(Boolean).join(' ');
            return (
              <div key={acc.id} className={`card flex flex-col gap-3 ${acc.isSelected ? 'ring-2 ring-sky-500 border-sky-500' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 grid place-items-center font-semibold flex-shrink-0">
                    {(name || acc.label).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 truncate">{acc.label}</span>
                      {acc.isSelected && <span className="badge-blue">Selected</span>}
                      {acc.isPremium && <span className="badge-purple">Premium</span>}
                    </div>
                    <div className="text-sm text-slate-500 truncate">
                      {name ? <bdi>{name}</bdi> : <span className="italic">Not logged in</span>}{acc.username && <span className="text-sky-600"> · @{acc.username}</span>}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">{acc.slug}{acc.phone ? ` · +${acc.phone.replace(/^\+/, '')}` : ''}</div>
                  </div>
                  {acc.sessionExists ? <span className="badge-green">Session ✓</span> : <span className="badge-red">No session</span>}
                </div>

                <div className="flex gap-4 text-xs text-slate-500">
                  <span><b className="text-slate-700 tabular-nums">{acc._count.chats}</b> chats</span>
                  <span><b className="text-slate-700 tabular-nums">{acc._count.contacts}</b> contacts</span>
                  <span><b className="text-slate-700 tabular-nums">{acc._count.jobs}</b> jobs</span>
                </div>

                <div className="flex gap-2 flex-wrap pt-1 border-t border-slate-100">
                  {!acc.isSelected && <button className="btn-primary btn-sm" onClick={() => select(acc.id)}>Select</button>}
                  {acc.sessionExists ? (
                    <button className="btn-secondary btn-sm" onClick={() => sync(acc.id)} disabled={syncing === acc.id}>
                      {syncing === acc.id ? <><Spinner /> Syncing…</> : '⟳ Sync'}
                    </button>
                  ) : null}
                  <button className="btn-secondary btn-sm" onClick={() => setWizard({ open: true, initial: { slug: acc.slug, label: acc.label, phone: acc.phone } })}>
                    {acc.sessionExists ? 'Re-login' : 'Log in'}
                  </button>
                  <span className="flex-1" />
                  <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={() => setRemoving(acc)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
