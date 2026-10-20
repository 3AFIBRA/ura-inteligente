import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { CallsPage, SupervisionPage, SettingsPage, ReportsPage } from './pages/OtherPages.js';
import { Layout } from './components/Layout.js';
import { Toaster } from './components/ui/Toaster.js';
import { ResourcePage, RoutesPage, FlowsPage, IntegrationsPage } from './pages/AdminPages.js';
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
      <Toaster />
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
          <Route path="tenants" element={<RoleRoute path="/tenants"><ResourcePage resource="tenants" /></RoleRoute>} />
          <Route path="users" element={<RoleRoute path="/users"><ResourcePage resource="users" /></RoleRoute>} />
          <Route path="trunks" element={<RoleRoute path="/trunks"><ResourcePage resource="trunks" /></RoleRoute>} />
          <Route path="extensions" element={<RoleRoute path="/extensions"><ResourcePage resource="extensions" /></RoleRoute>} />
          <Route path="routes" element={<RoleRoute path="/routes"><RoutesPage /></RoleRoute>} />
          <Route path="queues" element={<RoleRoute path="/queues"><ResourcePage resource="queues" /></RoleRoute>} />
          <Route path="flows" element={<RoleRoute path="/flows"><FlowsPage /></RoleRoute>} />
          <Route path="integrations" element={<RoleRoute path="/integrations"><IntegrationsPage /></RoleRoute>} />
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
