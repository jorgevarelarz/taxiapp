import React from 'react';

type InputProps = React.ComponentPropsWithoutRef<'input'> & {
  label?: string;
};

export function Input({ label, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="text-eyebrow block">{label}</label>
      )}
      <input
        id={inputId}
        className={`w-full bg-transparent text-[var(--ink)] border-b border-[var(--line-2)] py-3 outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--ink-4)] text-sm ${className}`}
        {...props}
      />
    </div>
  );
}
