import React from 'react';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'secondary';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 font-semibold',
  ghost: 'bg-white/[0.06] text-[var(--ink)] hover:bg-white/[0.10] border border-[var(--line)] font-semibold',
  secondary: 'bg-[var(--panel-2)] text-[var(--ink-2)] hover:bg-[var(--line)] border border-[var(--line)] font-semibold',
  danger: 'bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 border border-[var(--danger)]/20 font-semibold',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-xs rounded-[10px] gap-1.5',
  md: 'px-5 py-3 text-sm rounded-[var(--r-md)] gap-2',
  lg: 'px-6 py-4 text-base rounded-[var(--r-md)] gap-2',
};

export function Button({ variant = 'primary', size = 'md', loading, fullWidth, children, disabled, className = '', ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading && <Spinner size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}
