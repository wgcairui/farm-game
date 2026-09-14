import { useEffect, useState } from 'react';
import { getAuthToken } from '../authProvider';

async function fetchJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const body = (await res.json()) as { ok: true; data: T };
  return body.data;
}

export function LeasesPage() {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<{ liveLeases: number }>('/admin-ops/colyseus/status')
      .then((s) => setLiveCount(s.liveLeases))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Leases</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {loading
          ? 'Loading…'
          : `${liveCount} live lease${liveCount === 1 ? '' : 's'} across the WS pool. Use /admin-ops/leases/:ownerId/release to force a takeover; a per-lease browse view will land when the /admin-ops/leases list route is added.`}
      </div>
      <div className="text-xs text-slate-500">
        To force-release a known owner, run from a terminal:
        <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-3 text-xs overflow-auto">
{`curl -X POST \\
  -H "Authorization: Bearer $ADMIN_TOKEN" \\
  http://127.0.0.1:3000/admin-ops/leases/<ownerId>/release`}
        </pre>
      </div>
    </div>
  );
}
