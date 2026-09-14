import { Refine } from '@refinedev/core';
import routerProvider from '@refinedev/react-router-v6';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { authProvider, getAuthToken } from './authProvider';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { PlayersPage } from './pages/Players';
import { PlayerDetailPage } from './pages/PlayerDetail';
import { LeasesPage } from './pages/Leases';
import { ProcessesPage } from './pages/Processes';
import { AuditLogPage } from './pages/AuditLog';

function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  if (!getAuthToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/**
 * Pages use direct `fetch` (with our own `getAuthToken()` Bearer
 * header) instead of Refine's dataProvider — the Fastify routes
 * don't follow strict REST (e.g. `POST /admin-ops/players/:id/ban`
 * is a custom verb), and `@refinedev/simple-rest` v5 only accepts
 * an AxiosInstance, not a custom httpClient. We keep `<Refine>`
 * only so the authProvider wiring + resource declarations are
 * consistent for any future data hook usage.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Refine
        authProvider={authProvider}
        routerProvider={routerProvider}
        resources={[
          { name: 'players', list: '/players', show: '/players/:id' },
          { name: 'leases', list: '/leases' },
          { name: 'processes', list: '/processes' },
          { name: 'audit-log', list: '/audit-log' },
        ]}
      >
        <Routes>
          <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="players" element={<PlayersPage />} />
            <Route path="players/:id" element={<PlayerDetailPage />} />
            <Route path="leases" element={<LeasesPage />} />
            <Route path="processes" element={<ProcessesPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}
