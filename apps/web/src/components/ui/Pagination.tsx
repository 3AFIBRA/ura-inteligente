import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
      <span>{t('common.paginationSummary', { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}</span>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="prev">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2">
          {page} / {pages}
        </span>
        <Button size="icon" variant="outline" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="next">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
