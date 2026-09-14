import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { clearLogin, getStoredIdentity } from '../authProvider';

const NAV_ITEMS: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Dashboard' },
  { to: '/players', label: 'Players' },
  { to: '/leases', label: 'Leases' },
  { to: '/processes', label: 'Processes' },
  { to: '/audit-log', label: 'Audit Log' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const identity = getStoredIdentity();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="font-semibold text-slate-900">Farm Game</div>
          <div className="text-xs text-slate-500">Admin Console</div>
        </div>
        <nav className="p-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm ${
                  isActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-12 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
          <div className="text-sm text-slate-500">{now.toUTCString().slice(17, 25)} UTC</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-700">
              {identity?.username ?? 'unknown'}{' '}
              <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {identity?.role ?? '—'}
              </span>
            </span>
            <button
              type="button"
              className="text-slate-700 hover:text-slate-900 underline"
              onClick={() => {
                clearLogin();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
