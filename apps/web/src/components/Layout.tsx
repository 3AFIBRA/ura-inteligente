import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api.js';
import type { Tenant } from '../types/api.js';
import { useRealtimeSync } from '../hooks/useRealtime.js';
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
  Building2,
  GitBranch,
  Globe,
  LayoutDashboard,
  LogOut,
  Network,
  Phone,
  PhoneCall,
  Radio,
  Settings,
  Users,
  Workflow,
} from 'lucide-react';

const MENU: { to: string; labelKey: string; icon: ReactNode; roles: string[] }[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor', 'agent'] },
  { to: '/tenants', labelKey: 'nav.tenants', icon: <Building2 size={18} />, roles: ['superadmin'] },
  { to: '/users', labelKey: 'nav.users', icon: <Users size={18} />, roles: ['superadmin', 'tenant_admin'] },
  { to: '/trunks', labelKey: 'nav.trunks', icon: <PhoneCall size={18} />, roles: ['superadmin', 'tenant_admin'] },
  { to: '/extensions', labelKey: 'nav.extensions', icon: <Phone size={18} />, roles: ['superadmin', 'tenant_admin'] },
  { to: '/routes', labelKey: 'nav.routes', icon: <GitBranch size={18} />, roles: ['superadmin', 'tenant_admin'] },
  { to: '/queues', labelKey: 'nav.queues', icon: <Network size={18} />, roles: ['superadmin', 'tenant_admin'] },
  { to: '/flows', labelKey: 'nav.flows', icon: <Workflow size={18} />, roles: ['superadmin', 'tenant_admin'] },
  { to: '/integrations', labelKey: 'nav.integrations', icon: <Briefcase size={18} />, roles: ['superadmin', 'tenant_admin'] },
  { to: '/supervision', labelKey: 'nav.supervision', icon: <Radio size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor'] },
  { to: '/calls', labelKey: 'nav.calls', icon: <Phone size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor', 'agent'] },
  { to: '/reports', labelKey: 'nav.reports', icon: <BarChart3 size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor'] },
  { to: '/settings', labelKey: 'nav.settings', icon: <Settings size={18} />, roles: ['superadmin', 'tenant_admin', 'supervisor', 'agent'] },
];

export function Layout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, selectedTenantId, setSelectedTenant } = useAuthStore();
  const { data: tenants } = useQuery({ queryKey: ['tenants'], queryFn: () => get<Tenant[]>('/tenants'), enabled: user?.role === 'superadmin' });
  useRealtimeSync();
  const { connect, togglePanel, registration, selectedExtensionId } = useSoftphoneStore();

  useEffect(() => {
    const canRestoreSelectedExtension = Boolean(
      selectedExtensionId && (user?.role === 'superadmin' || user?.role === 'tenant_admin'),
    );
    if (user?.extension?.type === 'webrtc' || canRestoreSelectedExtension) void connect();
  }, [user, connect, selectedExtensionId, selectedTenantId]);

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-16 shrink-0 flex-col bg-sidebar shadow-xl sm:w-64">
        <div className="flex h-20 items-center justify-center gap-2 border-b border-white/10 px-2 sm:justify-start sm:px-4">
          <img src="/tudo-voip.png" alt="Tudo VoIP" className="h-11 w-11 rounded-lg bg-white object-contain p-1" />
          <div className="hidden min-w-0 sm:block"><span className="block text-sm font-bold tracking-wide text-white">Tudo VoIP</span><span className="block text-xs text-white/60">URA Inteligente</span></div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1 py-5 sm:px-3">
          {MENU.filter((m) => m.roles.includes(user?.role ?? '')).map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              title={t(m.labelKey)}
              className={({ isActive }) =>
                `flex items-center justify-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors sm:justify-start ${
                  isActive ? 'bg-sidebar-active text-white shadow-md' : 'text-sidebar-text hover:bg-sidebar-hover'
                }`
              }
            >
              {m.icon}
              <span className="hidden sm:inline">{t(m.labelKey)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-2 sm:p-3">
          <div className="mb-3 hidden items-center gap-2 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
              {(user?.name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <div className="mb-3 hidden items-center gap-2 sm:flex">
            <button
              onClick={() => togglePanel()}
              className={`flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-xs ${
                registration === 'registered' ? 'bg-green-900/50 text-green-400' : 'bg-white/10 text-white/80'
              }`}
            >
              <Briefcase size={14} />
              {registration === 'registered' ? 'WebRTC OK' : registration === 'error' ? 'WebRTC erro' : 'WebRTC'}
            </button>
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'pt-BR' ? 'en' : 'pt-BR')}
              className="rounded-md bg-white/10 p-2 text-white/80 hover:bg-white/20"
            >
              <Globe size={16} />
            </button>
          </div>
          <button
            onClick={doLogout}
            title={t('app.logout')}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-orange-200 hover:bg-white/10 sm:justify-start"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">{t('app.logout')}</span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[#f6f7fb]">
        <header className="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-8">
          <h2 className="truncate text-lg font-bold text-brand-navy sm:text-xl">
            {t(MENU.find((m) => m.to === location.pathname)?.labelKey ?? 'app.name')}
          </h2>
          <div className="flex items-center gap-3">
            {user?.role === 'superadmin' ? (
              <select aria-label="Empresa selecionada" value={selectedTenantId ?? ''} onChange={(event) => setSelectedTenant(event.target.value || null)} className="input max-w-[180px] sm:max-w-xs">
                <option value="">Selecione a empresa</option>
                {tenants?.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            ) : <span className="hidden rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 sm:inline">{user?.tenant?.name ?? user?.tenantId}</span>}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
              <Users size={16} />
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-8">
          <Outlet />
        </div>
      </main>
      <SoftphonePanel />
    </div>
  );
}
