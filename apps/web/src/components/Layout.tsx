import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useSoftphoneStore } from '../features/softphone/softphone.js';
import { SoftphonePanel } from '../features/softphone/SoftphonePanel.js';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  BarChart3,
  Briefcase,
  Globe,
  Headphones,
  LayoutDashboard,
  LogOut,
  Phone,
  Radio,
  Settings,
  Users,
} from 'lucide-react';

const MENU: { to: string; labelKey: string; icon: ReactNode; roles: string[] }[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor', 'agent'] },
  { to: '/supervision', labelKey: 'nav.supervision', icon: <Radio size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor'] },
  { to: '/calls', labelKey: 'nav.calls', icon: <Phone size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor', 'agent'] },
  { to: '/reports', labelKey: 'nav.reports', icon: <BarChart3 size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor'] },
  { to: '/settings', labelKey: 'nav.settings', icon: <Settings size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor', 'agent'] },
];

export function Layout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { connect, togglePanel, registration } = useSoftphoneStore();

  useEffect(() => {
    if (user?.extension?.type === 'webrtc') connect();
  }, [user, connect]);

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar">
        <div className="flex h-16 items-center gap-2 border-b border-slate-700 px-4">
          <Headphones className="text-primary-400" size={24} />
          <span className="font-semibold text-white">{t('app.name')}</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {MENU.filter((m) => m.roles.includes(user?.role ?? '')).map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-hover'
                }`
              }
            >
              {m.icon}
              {t(m.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-700 p-3">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
              {(user?.name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => togglePanel()}
              className={`flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-xs ${
                registration === 'registered' ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-300'
              }`}
            >
              <Briefcase size={14} />
              {registration === 'registered' ? 'WebRTC OK' : registration === 'error' ? 'WebRTC erro' : 'WebRTC'}
            </button>
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'pt-BR' ? 'en' : 'pt-BR')}
              className="rounded-md bg-slate-700 p-2 text-slate-300 hover:bg-slate-600"
            >
              <Globe size={16} />
            </button>
          </div>
          <button
            onClick={doLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-red-900/20"
          >
            <LogOut size={16} /> {t('app.logout')}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <h2 className="text-lg font-semibold text-slate-800">
            {t(MENU.find((m) => m.to === location.pathname)?.labelKey ?? 'app.name')}
          </h2>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 sm:inline">
              {user?.tenant?.name ?? user?.tenantId ?? 'Global'}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
              <Users size={14} className="text-slate-500" />
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
      <SoftphonePanel />
    </div>
  );
}
