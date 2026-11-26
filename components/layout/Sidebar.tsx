'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SystemStatus } from './DashboardLayout';

const NAV: { section: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    section: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
      { href: '/accounts', label: 'Accounts', icon: '👥' },
      { href: '/profile', label: 'Profile', icon: '🪪' },
      { href: '/security', label: 'Security & Privacy', icon: '🛡' },
    ],
  },
  {
    section: 'Data',
    items: [
      { href: '/chats', label: 'Chats', icon: '💬' },
      { href: '/contacts', label: 'Contacts', icon: '👤' },
      { href: '/messages', label: 'Messages', icon: '📨' },
      { href: '/media', label: 'Media', icon: '🖼' },
      { href: '/links', label: 'Links', icon: '🔗' },
    ],
  },
  {
    section: 'Actions',
    items: [
      { href: '/send', label: 'Send & Broadcast', icon: '✉' },
      { href: '/control', label: 'Operations', icon: '⚙' },
      { href: '/jobs', label: 'Jobs', icon: '⟳' },
      { href: '/location', label: 'Live Location', icon: '📍' },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/logs', label: 'Activity Log', icon: '📋' },
      { href: '/settings', label: 'Settings', icon: '🔧' },
    ],
  },
];

interface SidebarProps {
  status: SystemStatus | null;
  onSwitchAccount: (id: number) => void;
  onNavigate?: () => void;
}

export default function Sidebar({ status, onSwitchAccount, onNavigate }: SidebarProps) {
  const pathname = usePathname() || '';
  const active = status?.activeAccount;
  const worker = status?.worker;

  return (
    <aside className="w-60 bg-slate-900 text-white flex-shrink-0 flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <span className="w-8 h-8 rounded-lg bg-sky-500 grid place-items-center text-lg">✈</span>
          <span>
            <span className="block text-[11px] text-slate-400 uppercase tracking-wider leading-none">Telegram</span>
            <span className="block font-semibold text-sm">Control Panel</span>
          </span>
        </Link>

        {/* Account switcher */}
        <div className="mt-3">
          <label htmlFor="acct" className="text-[11px] text-slate-400 uppercase tracking-wider">Account</label>
          {status && status.accounts.length > 0 ? (
            <select
              id="acct"
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={active?.id ?? ''}
              onChange={(e) => onSwitchAccount(parseInt(e.target.value, 10))}
            >
              {!active && <option value="">— Select account —</option>}
              {status.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label}{a.username ? ` (@${a.username})` : ''}</option>
              ))}
            </select>
          ) : (
            <Link href="/accounts" onClick={onNavigate} className="mt-1 block text-xs text-amber-300 hover:text-amber-200">
              ⚠ No account yet — add one →
            </Link>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-3 mb-1 text-[11px] font-medium text-slate-500 uppercase tracking-wider">{group.section}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={`sidebar-link${isActive ? ' active' : ''}`}
                  >
                    <span className="w-5 text-center text-sm">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/jobs' && !!status?.activeJobs && (
                      <span className="text-[10px] font-semibold bg-sky-500 text-white rounded-full px-1.5 py-0.5 tabular-nums">{status.activeJobs}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800 space-y-2">
        <div className="flex items-center gap-2 text-xs" title={worker?.lastSeen ? `Last heartbeat: ${new Date(worker.lastSeen).toLocaleString()}` : 'No heartbeat yet'}>
          <span className={`w-2 h-2 rounded-full ${worker?.online ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-slate-400">Job worker {worker?.online ? 'online' : 'offline'}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 truncate">{status?.username ? `Signed in as ${status.username}` : ''}</span>
          <button
            type="button"
            className="text-slate-400 hover:text-white transition-colors"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/login';
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
