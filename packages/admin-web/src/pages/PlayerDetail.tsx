import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getAuthToken } from '../authProvider';

interface Identity {
  provider: string;
  subject: string;
  tenantId: string;
  boundAt: string;
}

interface PlayerDetail {
  playerId: string;
  nickname: string | null;
  avatarUrl: string | null;
  gold: number;
  gems: number;
  level: number;
  exp: number;
  revision: number;
  bannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  identities: Identity[];
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

export function PlayerDetailPage() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchJson<PlayerDetail>(`/admin-ops/players/${encodeURIComponent(playerId)}`)
      .then(setPlayer)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [playerId]);

  const ban = async () => {
    const reason = window.prompt(`Reason for banning ${playerId}?`, 'manual');
    if (reason === null) return;
    setBusy(true);
    try {
      await fetchJson<{ playerId: string }>(`/admin-ops/players/${encodeURIComponent(playerId)}/ban`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (error) return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-red-700">Player not found</h1>
      <p className="text-sm text-slate-600">{error}</p>
      <Link to="/players" className="text-brand-700 underline">← back to players</Link>
    </div>
  );
  if (!player) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{player.playerId}</h1>
          <p className="text-sm text-slate-500">{player.nickname ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          {player.bannedAt
            ? <span className="rounded bg-red-100 text-red-700 px-3 py-1 text-xs">banned since {new Date(player.bannedAt).toLocaleString()}</span>
            : <span className="rounded bg-green-100 text-green-700 px-3 py-1 text-xs">active</span>}
          {!player.bannedAt && (
            <button
              type="button"
              disabled={busy}
              className="rounded border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              onClick={ban}
            >
              Ban
            </button>
          )}
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => navigate('/players')}
          >
            Back
          </button>
        </div>
      </div>

      <section className="grid grid-cols-4 gap-3">
        {[
          ['gold', player.gold],
          ['gems', player.gems],
          ['level', player.level],
          ['exp', player.exp],
          ['revision', player.revision],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-600 mb-2">Identities</h2>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">provider</th>
                <th className="px-4 py-2 text-left font-medium">tenantId</th>
                <th className="px-4 py-2 text-left font-medium">subject</th>
                <th className="px-4 py-2 text-left font-medium">bound at</th>
              </tr>
            </thead>
            <tbody>
              {player.identities.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No identities bound.</td></tr>
              )}
              {player.identities.map((i, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="px-4 py-2">{i.provider}</td>
                  <td className="px-4 py-2 text-slate-700">{i.tenantId || '—'}</td>
                  <td className="px-4 py-2"><code className="text-xs">{i.subject}</code></td>
                  <td className="px-4 py-2 text-slate-700">{new Date(i.boundAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
