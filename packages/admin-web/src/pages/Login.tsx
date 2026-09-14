import { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { loginRequest, storeLogin, getAuthToken } from '../authProvider';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If we already have a token in localStorage, bounce to the
  // originally-requested page (default /) to avoid a flash of the
  // login form on a hard reload.
  if (typeof window !== 'undefined' && getAuthToken()) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  return (
    <div className="h-full grid place-items-center bg-slate-50">
      <form
        className="w-80 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSubmitting(true);
          try {
            const user = await loginRequest(username, password);
            storeLogin(user);
            const from = (location.state as { from?: string } | null)?.from ?? '/';
            navigate(from, { replace: true });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div>
          <h1 className="text-lg font-semibold">Farm Game Admin</h1>
          <p className="text-xs text-slate-500">Sign in with your operator account.</p>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Username</span>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Password</span>
            <input
              type="password"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <button
          type="submit"
          disabled={submitting || !username || !password}
          className="w-full rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
