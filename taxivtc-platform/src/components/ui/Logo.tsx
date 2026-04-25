import React from 'react';

const configs = {
  sm: { box: 32, fontSize: 15, nameClass: 'text-xl' },
  md: { box: 44, fontSize: 20, nameClass: 'text-2xl' },
  lg: { box: 56, fontSize: 26, nameClass: 'text-3xl' },
};

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const c = configs[size];
  return (
    <div className="flex items-center gap-3">
      <div
        style={{ width: c.box, height: c.box, fontSize: c.fontSize, background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-glow)', flexShrink: 0 }}
        className="flex items-center justify-center font-bold"
      >
        N
      </div>
      <span style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }} className={`${c.nameClass} leading-none`}>
        NORA
      </span>
    </div>
  );
}
