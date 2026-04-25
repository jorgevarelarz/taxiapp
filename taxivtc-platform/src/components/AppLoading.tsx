import React from 'react';
import { Logo, Spinner } from './ui';

export default function AppLoading({ label = 'Cargando NORA...' }: { label?: string }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }} className="flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6">
        <Logo size="lg" />
        <div className="flex items-center gap-2.5" style={{ color: 'var(--ink-3)' }}>
          <Spinner size={14} />
          <span className="text-sm">{label}</span>
        </div>
      </div>
    </div>
  );
}
