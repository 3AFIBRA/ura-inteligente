import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TabItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function Tabs({ items, value, onChange, className }: { items: TabItem[]; value: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-slate-200', className)} role="tablist">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            {it.icon}
            {it.label}
            {it.badge}
          </button>
        );
      })}
    </div>
  );
}
