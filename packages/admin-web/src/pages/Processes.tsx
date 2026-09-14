import { useEffect, useState } from 'react';
import { getAuthToken } from '../authProvider';

interface ColyseusStatus {
  rooms: number;
  ccus: number;
  liveLeases: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const body = (await res.json()) as { ok: true; data: T };
  return body.data;
}

export function ProcessesPage() {
  const [status, setStatus] = useState<ColyseusStatus | null>(null);

  useEffect(() => {
    fetchJson<ColyseusStatus>('/admin-ops/colyseus/status').then(setStatus);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Processes</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 space-y-1">
        <div>Rooms: <span className="font-mono">{status?.rooms ?? '—'}</span></div>
        <div>Connected clients: <span className="font-mono">{status?.ccus ?? '—'}</span></div>
        <div>Live leases: <span className="font-mono">{status?.liveLeases ?? '—'}</span></div>
      </div>
      <div className="text-xs text-slate-500">
        Per-instance process listing + Drain button will land once
        Stage F wires the WS entry to publish its <code>instanceId</code>
        into <code>/admin-ops/colyseus/instances</code>. For now the
        drain endpoint exists; a manual curl with the right instanceId
        triggers it:
        <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-3 text-xs overflow-auto">
{`curl -X POST \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  http://127.0.0.1:3000/admin-ops/processes/<instanceId>/drain`}
        </pre>
      </div>
    </div>
  );
}
