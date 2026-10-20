import { useTranslation } from 'react-i18next';

export function CallsPage() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
      {t('calls.title')} - em construcao
    </div>
  );
}
export function SupervisionPage() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
      {t('supervision.title')} - em construcao
    </div>
  );
}
export function ReportsPage() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
      {t('nav.reports')} - em construcao
    </div>
  );
}
export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
      {t('nav.settings')} - em construcao
    </div>
  );
}
