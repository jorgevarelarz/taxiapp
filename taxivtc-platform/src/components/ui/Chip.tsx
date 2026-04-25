import React from 'react';

export type ChipVariant = 'default' | 'accent' | 'danger' | 'ok' | 'warn';

const VARIANTS: Record<ChipVariant, string> = {
  default: 'bg-[var(--panel-2)] text-[var(--ink-3)] border-[var(--line)]',
  accent: 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20',
  danger: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20',
  ok: 'bg-[var(--ok)]/10 text-[var(--ok)] border-[var(--ok)]/20',
  warn: 'bg-[var(--warn)]/10 text-[var(--warn)] border-[var(--warn)]/20',
};

interface ChipProps {
  children: React.ReactNode;
  variant?: ChipVariant;
  className?: string;
}

export function Chip({ children, variant = 'default', className = '' }: ChipProps) {
  return (
    <span
      style={{ borderRadius: 'var(--r-full)' }}
      className={`inline-flex items-center text-eyebrow px-2.5 py-1 border ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
