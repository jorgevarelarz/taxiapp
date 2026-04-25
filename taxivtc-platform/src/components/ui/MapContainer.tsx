import React from 'react';

type MapContainerProps = React.ComponentPropsWithoutRef<'div'> & {
  height?: string;
};

export function MapContainer({ height = '260px', className = '', children, style, ...props }: MapContainerProps) {
  return (
    <div
      style={{ height, borderRadius: 'var(--r-xl)', overflow: 'hidden', background: 'var(--panel-2)', border: '1px solid var(--line)', ...style }}
      className={`relative w-full ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
