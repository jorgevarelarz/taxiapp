import React from 'react';
import { Chip } from './Chip';

export function PaymentBadge({ method, status }: { method: 'in_app' | 'cash'; status: string }) {
  const paid = status === 'paid';
  const variant = paid ? 'ok' : method === 'in_app' ? 'accent' : 'default';
  return (
    <Chip variant={variant}>
      {method === 'cash' ? 'Efectivo' : 'App'} · {paid ? 'Pagado' : 'Pendiente'}
    </Chip>
  );
}
