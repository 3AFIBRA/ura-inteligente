import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'gray' | 'green' | 'red' | 'yellow' | 'blue' | 'indigo' | 'teal' | 'purple';

const tones: Record<BadgeTone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-primary-50 text-primary-700 ring-primary-200',
  teal: 'bg-accent-50 text-accent-700 ring-accent-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

export function Badge({ tone = 'gray', dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function statusTone(status: string | undefined | null): BadgeTone {
  switch ((status || '').toLowerCase()) {
    case 'online':
    case 'registered':
    case 'reachable':
    case 'completed':
    case 'talking':
    case 'sent':
    case 'delivered':
    case 'read':
    case 'active':
    case 'ok':
      return 'green';
    case 'offline':
    case 'unregistered':
    case 'unreachable':
    case 'abandoned':
    case 'failed':
    case 'error':
    case 'inactive':
      return 'red';
    case 'busy':
    case 'in_queue':
    case 'queued':
    case 'paused':
      return 'yellow';
    case 'ringing':
    case 'in_ivr':
      return 'blue';
    default:
      return 'gray';
  }
}
