'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Sidebar from './Sidebar';
import { ToastProvider } from '@/components/ui';
import { api } from '@/lib/client';

export interface SystemStatus {
  username?: string;
  activeAccount: { id: number; label: string; slug: string; username?: string | null } | null;
  accounts: { id: number; label: string; slug: string; username?: string | null }[];
  worker: { online: boolean; lastSeen: string | null; embedded: boolean };
  activeJobs: number;
}

const StatusCtx = createContext<{ status: SystemStatus | null; refresh: () => void }>({ status: null, refresh: () => {} });
export const useSystemStatus = () => useContext(StatusCtx);

interface DashboardLayoutProps {
  children: ReactNode;
  /** @deprecated active link is derived from the URL */
  current?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Set false for pages that work without a selected account (e.g. Accounts) */
  requireAccount?: boolean;
}

export default function DashboardLayout({ children, title, subtitle, actions, requireAccount = true }: DashboardLayoutProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(async () => {
    const r = await api<SystemStatus>('/api/system');
    if (r.ok && r.data) setStatus(r.data);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  async function switchAccount(id: number) {
    const r = await api(`/api/accounts/${id}/select`, { method: 'POST' });
    if (r.ok) window.location.reload();
  }

  const noAccount = requireAccount && status && !status.activeAccount;

  return (
    <ToastProvider>
      <StatusCtx.Provider value={{ status, refresh }}>
        <div className="flex h-screen overflow-hidden">
          {/* Desktop sidebar */}
          <div className="hidden lg:flex"><Sidebar status={status} onSwitchAccount={switchAccount} /></div>

          {/* Mobile drawer */}
          {menuOpen && (
            <div className="lg:hidden fixed inset-0 z-40 flex">
              <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} />
              <div className="relative z-10 h-full"><Sidebar status={status} onSwitchAccount={switchAccount} onNavigate={() => setMenuOpen(false)} /></div>
            </div>
          )}

          <main className="flex-1 flex flex-col min-w-0">
            <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center gap-3 min-h-[57px]">
              <button className="lg:hidden text-xl text-slate-600 -ml-1 px-1" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
              <div className="flex-1 min-w-0">
                {title && <h1 className="text-lg font-semibold text-slate-800 truncate">{title}</h1>}
                {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
              </div>
              {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
            </header>

            {status && !status.worker.online && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-2 text-sm text-amber-900">
                ⚠ The background job worker is not running — operations will stay <b>Queued</b>.
                Start it with <code className="bg-amber-100 px-1 rounded">npm run worker</code> (or <code className="bg-amber-100 px-1 rounded">pm2 start ecosystem.config.js</code>),
                or set <code className="bg-amber-100 px-1 rounded">EMBEDDED_WORKER=true</code> in .env.
              </div>
            )}

            <div className="flex-1 overflow-auto p-4 lg:p-6">
              {noAccount ? (
                <div className="card max-w-lg text-center py-10">
                  <div className="text-3xl mb-2">👥</div>
                  <h2 className="font-semibold text-slate-800">No Telegram account selected</h2>
                  <p className="text-sm text-slate-500 mt-1 mb-4">Add a Telegram account (or pick one in the sidebar) to use this page.</p>
                  <a href="/accounts" className="btn-primary">Go to Accounts</a>
                </div>
              ) : children}
            </div>
          </main>
        </div>
      </StatusCtx.Provider>
    </ToastProvider>
  );
}
