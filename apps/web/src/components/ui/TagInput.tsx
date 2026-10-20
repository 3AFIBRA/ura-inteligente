import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export function TagInput({ label, value, onChange, placeholder, hint }: { label?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; hint?: string }) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const parts = draft
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) onChange(Array.from(new Set([...value, ...parts])));
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <div className={cn('input flex min-h-[38px] flex-wrap items-center gap-1 py-1')}>
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-700 ring-1 ring-inset ring-primary-200">
            {v}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-primary-500 hover:text-primary-800" aria-label="remove">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[80px] flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
        />
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
