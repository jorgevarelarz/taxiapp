import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Car, LogOut, Users, ShieldCheck, DollarSign, List, Map } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import type { Trip, Driver, License, PricingRule } from '../../types/api';
import { Logo, Card, TripStatusChip, Chip, Spinner } from '../../components/ui';
const LiveMap = lazy(() => import('./LiveMap'));

interface DriverLocation { driverId: string; lat: number; lng: number; heading: number; }

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number') return '--';
  return `${value.toFixed(2)}€`;
}

const NAV_ITEMS = [
  { key: 'map', label: 'Live Map', Icon: Map },
  { key: 'trips', label: 'Trips', Icon: List },
  { key: 'drivers', label: 'Drivers', Icon: Users },
  { key: 'licenses', label: 'Licenses', Icon: Car },
  { key: 'rules', label: 'Pricing', Icon: DollarSign },
];

export default function AdminHome() {
  const { token, logout } = useAuthStore();
  const [liveDrivers, setLiveDrivers] = useState<Record<string, DriverLocation>>({});
  const [view, setView] = useState('map');

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const counts: Record<string, number> = { trips: trips.length, drivers: drivers.length, licenses: licenses.length, rules: rules.length };

  useEffect(() => {
    const eventSource = new EventSource('/api/events/drivers');
    eventSource.addEventListener('driver_location_update', (e) => {
      const location = JSON.parse(e.data);
      if (location.lat && location.lng) {
        setLiveDrivers((prev) => ({ ...prev, [location.driverId]: location }));
      }
    });
    return () => eventSource.close();
  }, [token]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [nextTrips, nextDrivers, nextLicenses, nextRules] = await Promise.all([
          fetchJson<Trip[]>('/api/admin/trips', { headers: { Authorization: `Bearer ${token}` } }),
          fetchJson<Driver[]>('/api/admin/drivers', { headers: { Authorization: `Bearer ${token}` } }),
          fetchJson<License[]>('/api/admin/licenses', { headers: { Authorization: `Bearer ${token}` } }),
          fetchJson<PricingRule[]>('/api/admin/pricing-rules', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setTrips(nextTrips);
        setDrivers(nextDrivers);
        setLicenses(nextLicenses);
        setRules(nextRules);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'No se pudieron cargar los datos de admin');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token, view]);

  const renderTrips = () => (
    <div className="space-y-2">
      {trips.map((trip) => (
        <Card key={trip.id} variant="nested" className="p-4">
          <div className="flex justify-between gap-4">
            <div className="min-w-0">
              <p className="text-eyebrow mb-1">{trip.bookingReference || trip.id.slice(0, 8)}</p>
              <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{trip.passenger?.user?.name || 'Pasajero'}</p>
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{trip.originText}</p>
              <p className="text-xs truncate" style={{ color: 'var(--ink-2)' }}>{trip.destinationText}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <TripStatusChip status={trip.status} />
              <p className="text-base font-bold mt-2" style={{ color: 'var(--ink)' }}>
                {formatCurrency(trip.finalPrice ?? trip.agreedPrice ?? trip.estimatedPrice)}
              </p>
              <p className="text-eyebrow mt-0.5">{trip.paymentStatus}</p>
            </div>
          </div>
        </Card>
      ))}
      {trips.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin viajes todavía.</p>}
    </div>
  );

  const renderDrivers = () => (
    <div className="space-y-2">
      {drivers.map((driver) => (
        <Card key={driver.id} variant="nested" className="p-4 flex justify-between gap-4">
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{driver.user?.name || 'Conductor'}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{driver.user?.email}</p>
            <p className="text-eyebrow mt-1">{driver.licenseNumber}</p>
          </div>
          <div className="text-right flex-shrink-0 space-y-1">
            <Chip variant={driver.status === 'online' ? 'ok' : driver.status === 'busy' ? 'warn' : 'default'}>
              {driver.status}
            </Chip>
            <p className="text-eyebrow block">{driver.verificationStatus}</p>
          </div>
        </Card>
      ))}
      {drivers.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin conductores registrados.</p>}
    </div>
  );

  const renderLicenses = () => (
    <div className="space-y-2">
      {licenses.map((license) => (
        <Card key={license.id} variant="nested" className="p-4 flex justify-between gap-4">
          <div>
            <p className="font-semibold text-sm font-mono" style={{ color: 'var(--ink)' }}>{license.licenseCode}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{license.municipality}</p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{license.ownerName}</p>
          </div>
          <div className="text-right flex-shrink-0 space-y-1">
            <Chip variant={license.isActive ? 'ok' : 'default'}>{license.isActive ? 'Activa' : 'Inactiva'}</Chip>
            <p className="text-eyebrow block">{license.drivers?.length || 0} conductores</p>
          </div>
        </Card>
      ))}
      {licenses.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin licencias cargadas.</p>}
    </div>
  );

  const renderRules = () => (
    <div className="space-y-2">
      {rules.map((rule) => (
        <Card key={rule.id} variant="nested" className="p-4 flex justify-between gap-4">
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{rule.city}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Base {formatCurrency(rule.baseFare)} · Mínimo {formatCurrency(rule.minimumFare)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Día {formatCurrency(rule.perKmDay)}/km</p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Noche {formatCurrency(rule.perKmNight)}/km</p>
          </div>
        </Card>
      ))}
      {rules.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Sin reglas de precio definidas.</p>}
    </div>
  );

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--ink)' }} className="flex font-sans">
      {/* Sidebar */}
      <aside style={{ width: 220, background: 'var(--panel)', borderRight: '1px solid var(--line)', flexShrink: 0 }}
        className="flex flex-col justify-between p-5">
        <div>
          <div className="mb-8">
            <Logo size="sm" />
            <p className="text-eyebrow mt-2 ml-0.5">Control Panel</p>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map(({ key, label, Icon }) => {
              const active = view === key;
              const count = counts[key];
              return (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  style={{
                    background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--panel-2))' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--ink-3)',
                    borderRadius: 'var(--r-sm)',
                    border: active ? '1px solid color-mix(in srgb, var(--accent) 15%, transparent)' : '1px solid transparent',
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {count !== undefined && (
                    <span className="text-eyebrow" style={{ color: active ? 'var(--accent)' : 'var(--ink-4)' }}>{count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        <button
          onClick={logout}
          style={{ color: 'var(--ink-3)', borderRadius: 'var(--r-sm)' }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 relative overflow-hidden">
        {/* Live Map */}
        {view === 'map' && (
          <Suspense fallback={
            <div className="h-full w-full flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--ink-3)', background: 'var(--bg)' }}>
              <Spinner size={14} /> Cargando mapa...
            </div>
          }>
            <LiveMap liveDrivers={liveDrivers} />
          </Suspense>
        )}

        {/* Data views */}
        {view !== 'map' && (
          <div className="h-full overflow-y-auto p-8">
            <div className="max-w-4xl">
              <h1 className="text-2xl font-semibold capitalize mb-6" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
                {NAV_ITEMS.find((n) => n.key === view)?.label}
              </h1>

              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Viajes', value: trips.length },
                  { label: 'Conductores', value: drivers.length },
                  { label: 'Licencias', value: licenses.length },
                  { label: 'Reglas', value: rules.length },
                ].map((card) => (
                  <Card key={card.label} className="p-4">
                    <p className="text-eyebrow">{card.label}</p>
                    <p className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>{card.value}</p>
                  </Card>
                ))}
              </div>

              {error && (
                <div style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)' }}
                  className="border p-3 rounded-[var(--r-md)] text-sm font-medium mb-4">
                  {error}
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--ink-3)' }}>
                  <Spinner size={16} /> Cargando datos operativos...
                </div>
              ) : (
                <>
                  {view === 'trips' && renderTrips()}
                  {view === 'drivers' && renderDrivers()}
                  {view === 'licenses' && renderLicenses()}
                  {view === 'rules' && renderRules()}
                </>
              )}
            </div>
          </div>
        )}

        {/* Live drivers badge */}
        <div style={{ background: 'color-mix(in srgb, var(--panel) 90%, transparent)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', backdropFilter: 'blur(12px)' }}
          className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 shadow-lg">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--ok)' }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{Object.keys(liveDrivers).length}</span>
          <span className="text-sm" style={{ color: 'var(--ink-3)' }}>online</span>
        </div>
      </main>
    </div>
  );
}
