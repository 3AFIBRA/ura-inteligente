import { cn } from '../../lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export function MultiSelect({ label, options, value, onChange, hint, className }: { label?: string; options: MultiSelectOption[]; value: string[]; onChange: (v: string[]) => void; hint?: string; className?: string }) {
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };
  return (
    <div className={cn('w-full', className)}>
      {label && <label className="label">{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-primary-400',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
