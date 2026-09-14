import { useEffect, useState } from 'react';
import { getAuthToken } from '../authProvider';

interface AuditItem {
  id: number;
  adminUserId: number;
  action: string;
  targetPlayerId: string | null;
  payload: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditList {
  limit: number;
  offset: number;
  items: AuditItem[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const body = (await res.json()) as { ok: true; data: T };
  return body.data;
}

export function AuditLogPage() {
  const [data, setData] = useState<AuditList | null>(null);
  const [action, setAction] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (action) params.set('action', action);
    if (adminUserId) params.set('adminUserId', adminUserId);
    fetchJson<AuditList>(`/admin-ops/audit-log?${params.toString()}`)
      .then(setData)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="action (e.g. player.ban)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <input
          className="w-32 rounded border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="admin user id"
          value={adminUserId}
          onChange={(e) => setAdminUserId(e.target.value)}
        />
        <button
          type="button"
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          onClick={load}
        >
          Filter
        </button>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Admin</th>
              <th className="px-4 py-2 text-left font-medium">Target</th>
              <th className="px-4 py-2 text-left font-medium">Payload</th>
              <th className="px-4 py-2 text-left font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>}
            {!loading && data?.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No entries.</td></tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.action}</code></td>
                <td className="px-4 py-2 text-slate-700">{r.adminUserId}</td>
                <td className="px-4 py-2 text-slate-700">{r.targetPlayerId ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600 font-mono text-xs">
                  <code>{JSON.stringify(r.payload)}</code>
                </td>
                <td className="px-4 py-2 text-slate-700 text-xs">{r.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
