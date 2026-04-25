import React from 'react';

type CardVariant = 'dark' | 'light' | 'nested';

type CardProps = React.ComponentPropsWithoutRef<'div'> & {
  variant?: CardVariant;
  padding?: boolean;
};

const VARIANTS: Record<CardVariant, string> = {
  dark: 'bg-[var(--panel)] border border-[var(--line)]',
  light: 'bg-[#FAFAFB] text-zinc-900',
  nested: 'bg-[var(--panel-2)] border border-[var(--line)]',
};

export function Card({ variant = 'dark', padding = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      style={{ borderRadius: 'var(--r-xl)' }}
      className={`${VARIANTS[variant]} ${padding ? 'p-6' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
