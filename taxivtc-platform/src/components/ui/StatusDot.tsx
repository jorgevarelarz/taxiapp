import React from 'react';

const COLORS: Record<string, string> = {
  online: 'var(--ok)',
  offline: 'var(--ink-4)',
  busy: 'var(--warn)',
};

export function StatusDot({ status }: { status: 'online' | 'offline' | 'busy' | string }) {
  const color = COLORS[status] ?? 'var(--ink-4)';
  const pulse = status === 'online';
  return (
    <span className="relative inline-flex items-center justify-center w-3 h-3">
      {pulse && (
        <span style={{ background: color }} className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" />
      )}
      <span style={{ background: color }} className="relative inline-flex w-2.5 h-2.5 rounded-full" />
    </span>
  );
}
