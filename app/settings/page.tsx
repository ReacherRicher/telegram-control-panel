'use client';

import Link from 'next/link';
import DashboardLayout, { useSystemStatus } from '@/components/layout/DashboardLayout';
import { timeAgo } from '@/lib/client';

function WorkerCard() {
  const { status } = useSystemStatus();
  const w = status?.worker;
  return (
    <div className="card space-y-2">
      <h2 className="card-title">Background worker</h2>
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2.5 h-2.5 rounded-full ${w?.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span>{w?.online ? 'Online' : 'Offline'}</span>
        <span className="text-slate-400">· last heartbeat {timeAgo(w?.lastSeen)}</span>
        {w?.embedded && <span className="badge-blue">embedded in web server</span>}
      </div>
      <p className="text-sm text-slate-500">
        Jobs (forward, export, download, …) are executed by exactly one worker process. Either run
        <code className="bg-slate-100 px-1 mx-1 rounded">npm run worker</code> / PM2 <code className="bg-slate-100 px-1 rounded">tcp-worker</code>,
        or set <code className="bg-slate-100 px-1 rounded">EMBEDDED_WORKER=true</code> to run jobs inside the web server — never both.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <DashboardLayout title="Settings" requireAccount={false}>
      <div className="max-w-3xl space-y-4">
        <div className="card space-y-2">
          <h2 className="card-title">Telegram accounts</h2>
          <p className="text-sm text-slate-500">Add, re-login or remove accounts. Sessions are stored in <code className="bg-slate-100 px-1 rounded">sessions/&lt;id&gt;.session</code> — treat these files like passwords.</p>
          <Link href="/accounts" className="btn-secondary btn-sm">Manage accounts →</Link>
        </div>

        <WorkerCard />

        <div className="card space-y-2 text-sm text-slate-600">
          <h2 className="card-title">Storage</h2>
          <ul className="space-y-1">
            <li>Database: <code className="bg-slate-100 px-1 rounded">prisma/data/telegramcontrolpanel.db</code> (from <code className="bg-slate-100 px-1 rounded">DATABASE_URL</code>)</li>
            <li>Downloads: <code className="bg-slate-100 px-1 rounded">storage/downloads/&lt;account&gt;/&lt;chat id&gt;/</code></li>
            <li>Exports: <code className="bg-slate-100 px-1 rounded">storage/exports/job-&lt;id&gt;/</code></li>
            <li>Logs: <code className="bg-slate-100 px-1 rounded">logs/</code></li>
          </ul>
        </div>

        <div className="card space-y-2 text-sm text-slate-600">
          <h2 className="card-title">Security checklist</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Use a long <code className="bg-slate-100 px-1 rounded">ADMIN_PASSWORD</code> (a bcrypt hash is also accepted) and a random <code className="bg-slate-100 px-1 rounded">SESSION_SECRET</code>.</li>
            <li>Serve the panel over HTTPS (Nginx/Caddy) and set <code className="bg-slate-100 px-1 rounded">COOKIE_SECURE=true</code>.</li>
            <li>Firewall port 4567 so only you (or the reverse proxy) can reach it.</li>
            <li>Back up <code className="bg-slate-100 px-1 rounded">sessions/</code> and the database privately — never commit them.</li>
            <li>Failed admin logins are rate-limited (8 per 15 minutes per IP) and recorded in the Activity log.</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
