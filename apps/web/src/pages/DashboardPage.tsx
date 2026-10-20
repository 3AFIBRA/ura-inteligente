import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { StatCard, Card } from '../components/ui/Card.js';
import { get, getErrorMessage } from '../lib/api.js';
import { useEffectiveTenantId, useTenantQuery } from '../hooks/useTenantQuery.js';
import { useAuthStore } from '../store/auth.js';
import type { CallDetail, ReportOverview } from '../types/api.js';
import { Phone, Users, Clock, CheckCircle, XCircle, TrendingUp, ArrowRight } from 'lucide-react';

export function DashboardPage() {
  const { t } = useTranslation();
  const tenantId = useEffectiveTenantId();
  const role = useAuthStore((state) => state.user?.role);
  const today = new Date().toISOString().slice(0, 10);
  const report = useTenantQuery(['reports', 'overview', today], () => get<ReportOverview>(`/reports/overview?from=${today}`), { refetchInterval: 30000 });
  const active = useTenantQuery(['calls', 'active'], () => get<CallDetail[]>('/calls/active/all'), { refetchInterval: 10000 });
  if (!tenantId) return <div className="card p-8 text-center text-slate-600">Selecione uma empresa no topo para visualizar o painel.</div>;
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-brand-navy p-6 text-white sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">Tudo VoIP · URA Inteligente</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Visão geral do atendimento</h1>
        <p className="mt-2 text-sm text-white/70">Indicadores de hoje, atualizados automaticamente.</p>
      </div>
      {(report.error || active.error) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Falha ao carregar indicadores: {getErrorMessage(report.error || active.error)}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label={t('dashboard.activeCalls')} value={active.data?.length ?? '—'} icon={<Phone size={20} />} tone="primary" />
        <StatCard label={t('dashboard.totalCalls')} value={report.data?.totalCalls ?? '—'} icon={<Users size={20} />} />
        <StatCard label={t('dashboard.answered')} value={report.data?.answered ?? '—'} icon={<CheckCircle size={20} />} tone="accent" />
        <StatCard label={t('dashboard.abandoned')} value={report.data?.abandoned ?? '—'} icon={<XCircle size={20} />} tone="danger" />
        <StatCard label={t('dashboard.sla')} value={report.data ? `${report.data.slaPct}%` : '—'} icon={<TrendingUp size={20} />} tone="primary" />
        <StatCard label="Espera média" value={report.data ? `${report.data.avgWaitSec}s` : '—'} icon={<Clock size={20} />} />
      </div>
      <Card title="Acesso rápido" description="Acompanhe sua operação em tempo real">
        <div className="grid gap-3 sm:grid-cols-3">
          {([['/calls', 'Histórico de chamadas'], ...(role === 'agent' ? [] : [['/supervision', 'Supervisão'], ['/reports', 'Relatórios']])]).map(([path, label]) => <Link key={path} to={path} className="flex items-center justify-between rounded-lg border border-slate-200 p-4 text-sm font-medium text-brand-navy transition-colors hover:border-brand-orange hover:bg-accent-50">{label}<ArrowRight size={16} className="text-brand-orange" /></Link>)}
        </div>
      </Card>
    </div>
  );
}
