import { useTranslation } from 'react-i18next';
import { StatCard } from '../components/ui/Card.js';
import { Phone, Users, Clock, CheckCircle, XCircle, TrendingUp } from 'lucide-react';

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('dashboard.activeCalls')} value="0" icon={<Phone size={20} />} tone="primary" />
        <StatCard label={t('dashboard.totalCalls')} value="0" icon={<Users size={20} />} />
        <StatCard label={t('dashboard.answered')} value="0" icon={<CheckCircle size={20} />} tone="accent" />
        <StatCard label={t('dashboard.abandoned')} value="0" icon={<XCircle size={20} />} tone="danger" />
        <StatCard label={t('dashboard.sla')} value="0%" icon={<TrendingUp size={20} />} tone="primary" />
        <StatCard label={t('dashboard.boletos')} value="0" icon={<Clock size={20} />} />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        {t('app.loading')}
      </div>
    </div>
  );
}
