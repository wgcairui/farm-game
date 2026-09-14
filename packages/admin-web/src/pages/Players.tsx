import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthToken } from '../authProvider';

interface PlayerItem {
  playerId: string;
  nickname: string | null;
  gold: number;
  gems: number;
  level: number;
  revision: number;
  bannedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  total: number;
  limit: number;
  offset: number;
  items: PlayerItem[];
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  const token = getAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers });
  const body = (await res.json()) as { ok: true; data: T } | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.data;
}

export function PlayersPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  const load = (q: string) => {
    setLoading(true);
    const url = '/admin-ops/players?limit=50' + (q ? `&search=${encodeURIComponent(q)}` : '');
    fetchJson<ListResponse>(url)
      .then(setData)
      .catch((err) => setToast({ type: 'error', message: (err as Error).message }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(''); }, []);

  const ban = async (playerId: string) => {
    const reason = window.prompt(`Reason for banning ${playerId}?`, 'manual');
    if (reason === null) return;
    try {
      await fetchJson<{ playerId: string; bannedAt: string }>(`/admin-ops/players/${playerId}/ban`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      setToast({ type: 'success', message: `banned ${playerId}` });
      load(search);
    } catch (err) {
      setToast({ type: 'error', message: (err as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Players</h1>
      {toast && (
        <div
          className={`rounded px-3 py-2 text-sm ${
            toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
          onAnimationEnd={() => setToast(null)}
        >
          {toast.message}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
          placeholder="Search playerId or nickname…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(search); }}
        />
        <button
          type="button"
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => load(search)}
        >
          Search
        </button>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">playerId</th>
              <th className="px-4 py-2 text-left font-medium">nickname</th>
              <th className="px-4 py-2 text-right font-medium">gold</th>
              <th className="px-4 py-2 text-right font-medium">level</th>
              <th className="px-4 py-2 text-left font-medium">status</th>
              <th className="px-4 py-2 text-right font-medium">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>}
            {!loading && data?.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No players found.</td></tr>
            )}
            {data?.items.map((p) => (
              <tr key={p.playerId} className="border-t border-slate-100">
                <td className="px-4 py-2"><Link className="text-brand-700 underline" to={`/players/${p.playerId}`}>{p.playerId}</Link></td>
                <td className="px-4 py-2 text-slate-700">{p.nickname ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.gold}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.level}</td>
                <td className="px-4 py-2">
                  {p.bannedAt
                    ? <span className="rounded bg-red-100 text-red-700 px-2 py-0.5 text-xs">banned</span>
                    : <span className="rounded bg-green-100 text-green-700 px-2 py-0.5 text-xs">active</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  {!p.bannedAt && (
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                      onClick={() => ban(p.playerId)}
                    >
                      Ban
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="text-xs text-slate-500">
          {data.total} total · showing {data.items.length}
        </div>
      )}
    </div>
  );
}
