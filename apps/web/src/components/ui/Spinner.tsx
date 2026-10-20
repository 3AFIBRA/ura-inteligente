import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-primary-600', className)} />;
}

export function PageLoading({ label }: { label?: string }) {
  return (
    <div className="flex h-48 w-full flex-col items-center justify-center gap-2 text-slate-500">
      <Spinner className="h-7 w-7" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
