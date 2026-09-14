import { useEffect, useState } from 'react';
import { getAuthToken } from '../authProvider';

interface AuditItem {
  id: number;
  action: string;
  targetPlayerId: string | null;
  adminUserId: number;
  createdAt: string;
}

interface ColyseusStatus {
  rooms: number;
  ccus: number;
  liveLeases: number;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const body = (await res.json()) as { ok: true; data: T };
  return body.data;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const [status, setStatus] = useState<ColyseusStatus | null>(null);
  const [recent, setRecent] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, a] = await Promise.all([
        fetchJson<ColyseusStatus>('/admin-ops/colyseus/status'),
        fetchJson<{ items: AuditItem[] }>('/admin-ops/audit-log?limit=5'),
      ]);
      if (cancelled) return;
      setStatus(s);
      setRecent(a?.items ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Rooms" value={status?.rooms ?? '—'} />
        <StatCard label="Connected clients" value={status?.ccus ?? '—'} />
        <StatCard label="Live leases" value={status?.liveLeases ?? '—'} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-2">Recent audit log</h2>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">When</th>
                <th className="px-4 py-2 text-left font-medium">Action</th>
                <th className="px-4 py-2 text-left font-medium">Admin user</th>
                <th className="px-4 py-2 text-left font-medium">Target player</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
              )}
              {!loading && recent.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No audit entries yet.</td></tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.action}</code></td>
                  <td className="px-4 py-2 text-slate-700">{r.adminUserId}</td>
                  <td className="px-4 py-2 text-slate-700">{r.targetPlayerId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
