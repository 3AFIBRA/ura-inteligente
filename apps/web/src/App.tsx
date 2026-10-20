import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { CallsPage, SupervisionPage, SettingsPage, ReportsPage } from './pages/OtherPages.js';
import { Layout } from './components/Layout.js';
import type { Role } from '@ura/shared';

const ROLE_ROUTES: Record<Role, string[]> = {
  superadmin: ['/', '/tenants', '/users', '/trunks', '/extensions', '/routes', '/queues', '/flows', '/integrations', '/calls', '/supervision', '/reports', '/settings'],
  tenant_admin: ['/', '/users', '/trunks', '/extensions', '/routes', '/queues', '/flows', '/integrations', '/calls', '/supervision', '/reports', '/settings'],
  supervisor: ['/', '/calls', '/supervision', '/reports', '/settings'],
  agent: ['/', '/calls', '/settings'],
};

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  const allowed = ROLE_ROUTES[user.role] ?? [];
  if (!allowed.includes(path)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="calls" element={<RoleRoute path="/calls"><CallsPage /></RoleRoute>} />
          <Route path="supervision" element={<RoleRoute path="/supervision"><SupervisionPage /></RoleRoute>} />
          <Route path="reports" element={<RoleRoute path="/reports"><ReportsPage /></RoleRoute>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
