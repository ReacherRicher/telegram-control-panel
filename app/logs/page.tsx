'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';

interface Log {
  id: number;
  action: string;
  details?: string;
  sourceChat?: string;
  destChat?: string;
  itemCount?: number;
  successCount?: number;
  failCount?: number;
  ipAddress?: string;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'badge-green',
  LOGOUT: 'badge-gray',
  SYNC: 'badge-blue',
  INDEX: 'badge-blue',
  DOWNLOAD: 'badge-purple',
  EXPORT: 'badge-yellow',
  FORWARD: 'badge-blue',
  DELETE: 'badge-red',
  JOIN: 'badge-green',
  LEAVE: 'badge-yellow',
  MARK_READ: 'badge-gray',
  LOCATION_START: 'badge-green',
  LOCATION_STOP: 'badge-gray',
  SEND: 'badge-blue',
  PROFILE_UPDATE: 'badge-purple',
  SECURITY: 'badge-yellow',
  ERROR: 'badge-red',
};

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50', action });
    const res = await fetch(`/api/logs?${params}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    const json = await res.json();
    if (json.success) { setLogs(json.data); setTotal(json.total); }
    setLoading(false);
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 50);

  return (
    <DashboardLayout title="Activity log" subtitle={`${total.toLocaleString()} entries`}>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center gap-3">
          <select className="select w-auto" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">All actions</option>
            {['LOGIN', 'LOGOUT', 'SYNC', 'INDEX', 'DOWNLOAD', 'EXPORT', 'FORWARD', 'DELETE', 'JOIN', 'LEAVE', 'MARK_READ', 'LOCATION_START', 'LOCATION_STOP', 'SEND', 'PROFILE_UPDATE', 'SECURITY', 'ERROR'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button className="btn-secondary btn-sm" onClick={load}>↺ Refresh</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Source</th>
                <th>Destination</th>
                <th>Details</th>
                <th>Results</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center py-6 text-gray-400">Loading...</td></tr>}
              {!loading && logs.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">No logs yet.</td></tr>}
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs text-gray-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td><span className={ACTION_COLORS[l.action] || 'badge-gray'}>{l.action}</span></td>
                  <td className="text-xs text-gray-600" dir="auto">{l.sourceChat || '—'}</td>
                  <td className="text-xs text-gray-600" dir="auto">{l.destChat || '—'}</td>
                  <td className="text-xs max-w-md text-gray-600 break-words" dir="auto">{l.details || '—'}{l.ipAddress && l.ipAddress !== 'unknown' ? <span className="text-gray-400"> · {l.ipAddress}</span> : null}</td>
                  <td className="text-xs text-gray-500">
                    {l.successCount !== null && l.successCount !== undefined && `✓${l.successCount} `}
                    {l.failCount !== null && l.failCount !== undefined && l.failCount > 0 && `✗${l.failCount}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 justify-end">
            <button className="btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
            <span className="text-sm text-gray-500">{page} / {totalPages}</span>
            <button className="btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
