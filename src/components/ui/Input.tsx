import React, { useId } from 'react';

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

function FieldShell({ id, label, required, optional, error, hint, className, children }: FieldShellProps) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <label htmlFor={id} className="text-13 text-ink-2">
        {label}
        {required && <span aria-hidden="true"> *</span>}
        {optional && <span className="text-ink-2"> · opcional</span>}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} className="text-xs text-error-ink">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-xs text-ink-2">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type BaseProps = {
  label: string;
  error?: string | null;
  hint?: React.ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
};

export type TextInputProps = BaseProps & React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };

export function TextInput({ label, error, hint, optional, wrapperClassName, id, className, required, ...rest }: TextInputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <FieldShell id={fieldId} label={label} required={required} optional={optional} error={error} hint={hint} className={wrapperClassName}>
      <input
        id={fieldId}
        className={`field-input ${className ?? ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export type TextAreaProps = BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> };

export function TextArea({ label, error, hint, optional, wrapperClassName, id, className, required, rows = 4, ...rest }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <FieldShell id={fieldId} label={label} required={required} optional={optional} error={error} hint={hint} className={wrapperClassName}>
      <textarea
        id={fieldId}
        rows={rows}
        className={`field-input ${className ?? ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        {...rest}
      />
    </FieldShell>
  );
}
