import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, containerClassName, id, ...rest }, ref) => {
    const selectId = id || rest.name;
    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label htmlFor={selectId} className="label">
            {label}
            {rest.required && <span className="text-red-500"> *</span>}
          </label>
        )}
        <select ref={ref} id={selectId} className={cn('input', error && 'border-red-400', className)} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {!error && hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';
