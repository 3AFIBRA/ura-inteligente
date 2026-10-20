import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, containerClassName, id, ...rest }, ref) => {
    const inputId = id || rest.name;
    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
            {rest.required && <span className="text-red-500"> *</span>}
          </label>
        )}
        <input ref={ref} id={inputId} className={cn('input', error && 'border-red-400 focus:border-red-500 focus:ring-red-500', className)} {...rest} />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {!error && hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, hint, className, id, ...rest }, ref) => {
  const inputId = id || rest.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <textarea ref={ref} id={inputId} className={cn('input min-h-[80px]', error && 'border-red-400', className)} {...rest} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
});
Textarea.displayName = 'Textarea';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ label, description, className, id, ...rest }, ref) => {
  const inputId = id || rest.name;
  return (
    <label htmlFor={inputId} className={cn('flex cursor-pointer items-start gap-2 text-sm', className)}>
      <input ref={ref} id={inputId} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" {...rest} />
      <span>
        <span className="font-medium text-slate-700">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
});
Checkbox.displayName = 'Checkbox';
