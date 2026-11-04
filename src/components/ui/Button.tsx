import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'confirm' | 'discard' | 'signal';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** Muestra un spinner de 12px y reemplaza el texto por `loadingText`. */
  loading?: boolean;
  loadingText?: React.ReactNode;
  icon?: React.ReactNode;
  /** Atajo de teclado que se muestra como <kbd> a la derecha. */
  kbd?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingText,
  icon,
  kbd,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
      {kbd && !loading && <kbd aria-hidden="true">{kbd}</kbd>}
    </button>
  );
}

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Obligatorio: los botones de solo ícono necesitan un nombre accesible. */
  label: string;
  size?: 'md' | 'sm';
  bare?: boolean;
  children: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}

export function IconButton({ label, size = 'md', bare, className, children, type = 'button', title, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx('btn btn-icon', size === 'sm' && 'btn-sm', bare && 'btn-icon-bare', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
