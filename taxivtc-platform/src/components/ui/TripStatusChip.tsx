import React from 'react';
import { Chip, ChipVariant } from './Chip';

const STATUS_MAP: Record<string, { label: string; variant: ChipVariant }> = {
  requested:          { label: 'Solicitado',      variant: 'default' },
  driver_en_route:    { label: 'En camino',        variant: 'accent' },
  arrived_at_pickup:  { label: 'En punto',         variant: 'accent' },
  passenger_on_board: { label: 'A bordo',          variant: 'accent' },
  in_progress:        { label: 'En curso',         variant: 'accent' },
  completed:          { label: 'Completado',       variant: 'ok' },
  cancelled:          { label: 'Cancelado',        variant: 'danger' },
  no_show:            { label: 'No presentado',    variant: 'danger' },
};

export function TripStatusChip({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, variant: 'default' as ChipVariant };
  return <Chip variant={entry.variant}>{entry.label}</Chip>;
}
