import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ArrowLeft, User, Clock, MapPin, CreditCard, Banknote } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Logo, Card, TripStatusChip, PaymentBadge, Spinner } from '../../components/ui';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface HistoryTrip {
  id: string;
  bookingReference: string;
  status: string;
  originText: string;
  destinationText: string;
  finalPrice: number | null;
  agreedPrice: number;
  paymentMethod: 'in_app' | 'cash';
  paymentStatus: string;
  completedAt: string | null;
  requestedAt: string;
  passenger: { user: { name: string } } | null;
}

export default function DriverHistory() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<HistoryTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<HistoryTrip[]>('/api/driver/history', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(setTrips)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el historial'))
      .finally(() => setIsLoading(false));
  }, [token]);

  const formatDate = (d: string) => format(new Date(d), "d MMM yyyy · HH:mm", { locale: es });
  const price = (t: HistoryTrip) => (t.finalPrice ?? t.agreedPrice ?? 0).toFixed(2);

  const totalHoy = trips
    .filter((t) => t.status === 'completed' && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString())
    .reduce((s, t) => s + (t.finalPrice ?? 0), 0);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)' }} className="font-sans flex flex-col">
      <header style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}
        className="p-4 flex items-center gap-4 sticky top-0 z-20">
        <button onClick={() => navigate('/driver')} className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
        </button>
        <Logo size="sm" />
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4 pb-8">
        <div className="pt-2 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)', fontFamily: 'var(--font-serif)' }}>
              Mis servicios
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {trips.length > 0 ? `${trips.length} servicios` : 'Historial de viajes'}
            </p>
          </div>
          {totalHoy > 0 && (
            <div className="text-right">
              <p className="text-eyebrow">Hoy</p>
              <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{totalHoy.toFixed(2)}€</p>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)' }}
            className="border p-3 rounded-[var(--r-md)] text-sm font-medium">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm" style={{ color: 'var(--ink-3)' }}>
            <Spinner size={14} /> Cargando servicios...
          </div>
        ) : trips.length === 0 ? (
          <Card className="p-14 flex flex-col items-center text-center gap-4">
            <Clock className="w-12 h-12 opacity-10" style={{ color: 'var(--ink)' }} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Sin servicios todavía</p>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>Tus viajes completados aparecerán aquí.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => (
              <Card key={trip.id} className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-eyebrow">{trip.bookingReference}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <TripStatusChip status={trip.status as any} />
                      <PaymentBadge method={trip.paymentMethod} status={trip.paymentStatus} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{price(trip)}€</p>
                    <div className="flex items-center justify-end gap-1 mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      {trip.paymentMethod === 'cash'
                        ? <><Banknote className="w-3 h-3" /><span className="text-eyebrow">Efectivo</span></>
                        : <><CreditCard className="w-3 h-3" /><span className="text-eyebrow">App</span></>}
                    </div>
                  </div>
                </div>

                <Card variant="nested" className="p-3 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>{trip.originText}</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full border" style={{ borderColor: 'var(--ink-3)' }} />
                    </div>
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>{trip.destinationText}</p>
                  </div>
                </Card>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
                    <User className="w-3.5 h-3.5" />
                    <span className="text-xs">{trip.passenger?.user?.name ?? 'Pasajero'}</span>
                  </div>
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--ink-4)' }}>
                    <Clock className="w-3 h-3" />
                    <span className="text-eyebrow">{formatDate(trip.completedAt ?? trip.requestedAt)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
