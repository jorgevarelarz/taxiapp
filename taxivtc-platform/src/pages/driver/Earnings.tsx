import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Logo, Card, Spinner } from '../../components/ui';

interface Earnings {
  today: { total: number; trips: number };
  week: { total: number; trips: number };
  month: { total: number; trips: number };
  pctVsYesterday: number | null;
}

export default function DriverEarnings() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState<Earnings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await fetchJson<Earnings>('/api/driver/earnings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron cargar las ganancias');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [token]);

  const fmt = (n: number) => `${n.toFixed(2)}€`;

  const TrendIcon = data?.pctVsYesterday == null
    ? Minus
    : data.pctVsYesterday >= 0 ? TrendingUp : TrendingDown;
  const trendColor = data?.pctVsYesterday == null
    ? 'var(--ink-3)'
    : data.pctVsYesterday >= 0 ? 'var(--ok)' : 'var(--danger)';

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
        <div className="pt-2">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)', fontFamily: 'var(--font-serif)' }}>
            Mis ganancias
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Resumen de ingresos</p>
        </div>

        {error && (
          <div style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)' }}
            className="border p-3 rounded-[var(--r-md)] text-sm font-medium">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm" style={{ color: 'var(--ink-3)' }}>
            <Spinner size={14} /> Cargando ganancias...
          </div>
        ) : data && (
          <div className="space-y-3">
            {/* Hoy — tarjeta principal */}
            <Card className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-eyebrow">Hoy</p>
                  <p className="text-4xl font-bold mt-2" style={{ color: 'var(--ink)' }}>
                    {fmt(data.today.total)}
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
                    {data.today.trips} {data.today.trips === 1 ? 'viaje' : 'viajes'}
                  </p>
                </div>
                {data.pctVsYesterday !== null && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-full)]"
                    style={{ background: `color-mix(in srgb, ${trendColor} 12%, transparent)` }}>
                    <TrendIcon className="w-3.5 h-3.5" style={{ color: trendColor }} />
                    <span className="text-xs font-bold" style={{ color: trendColor }}>
                      {data.pctVsYesterday > 0 ? '+' : ''}{data.pctVsYesterday}% vs ayer
                    </span>
                  </div>
                )}
              </div>
            </Card>

            {/* Semana y mes */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Esta semana', data: data.week },
                { label: 'Este mes', data: data.month },
              ].map(({ label, data: d }) => (
                <Card key={label} className="p-5">
                  <p className="text-eyebrow">{label}</p>
                  <p className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>{fmt(d.total)}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                    {d.trips} {d.trips === 1 ? 'viaje' : 'viajes'}
                  </p>
                </Card>
              ))}
            </div>

            {data.today.trips === 0 && data.week.trips === 0 && (
              <Card className="p-10 flex flex-col items-center text-center gap-3">
                <TrendingUp className="w-10 h-10 opacity-10" style={{ color: 'var(--ink)' }} />
                <div>
                  <p className="font-semibold" style={{ color: 'var(--ink)' }}>Sin viajes todavía</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
                    Conéctate para empezar a recibir servicios.
                  </p>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
