import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
}

export function Card({ title, description, actions, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('card', className)} {...rest}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && 'p-4')}>{children}</div>
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'primary' | 'accent' | 'danger' | 'warning';
}

const tones: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-slate-100 text-slate-600',
  primary: 'bg-primary-100 text-primary-700',
  accent: 'bg-accent-100 text-accent-700',
  danger: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
};

export function StatCard({ label, value, icon, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className="card flex items-center gap-4 p-4">
      {icon && <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
