import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Car, LogOut, Users, ShieldCheck, DollarSign, List, Map } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import type { Trip, Driver, License, PricingRule } from '../../types/api';
const LiveMap = lazy(() => import('./LiveMap'));

interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading: number;
}

function formatCurrency(value?: number | null) {
  if (typeof value !== 'number') return '--';
  return `${value.toFixed(2)}€`;
}

export default function AdminHome() {
  const { token, logout } = useAuthStore();
  const [liveDrivers, setLiveDrivers] = useState<Record<string, DriverLocation>>({});
  const [view, setView] = useState('map'); // map, trips, drivers, licenses, rules
  
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/events/drivers');

    eventSource.addEventListener('driver_location_update', (e) => {
      const location = JSON.parse(e.data);
      if (location.lat && location.lng) {
        setLiveDrivers(prevDrivers => ({
          ...prevDrivers,
          [location.driverId]: location,
        }));
      }
    });

    return () => {
      eventSource.close();
    };
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

  const summaryCards = [
    { label: 'Viajes', value: trips.length },
    { label: 'Conductores', value: drivers.length },
    { label: 'Licencias', value: licenses.length },
    { label: 'Reglas', value: rules.length },
  ];

  const renderTrips = () => (
    <div className="space-y-3">
      {trips.map((trip: Trip) => (
        <div key={trip.id} className="rounded-2xl border border-zinc-100 p-4">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{trip.bookingReference || trip.id}</p>
              <p className="font-bold text-zinc-900">{trip.passenger?.user?.name || 'Pasajero'}</p>
              <p className="text-sm text-zinc-500 truncate">{trip.originText}</p>
              <p className="text-sm text-zinc-800 truncate">{trip.destinationText}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">{trip.status}</p>
              <p className="text-lg font-black">{formatCurrency(trip.finalPrice ?? trip.agreedPrice ?? trip.estimatedPrice)}</p>
              <p className="text-xs text-zinc-500">{trip.paymentStatus}</p>
            </div>
          </div>
        </div>
      ))}
      {trips.length === 0 && <div className="text-sm text-zinc-500">Sin viajes todavía.</div>}
    </div>
  );

  const renderDrivers = () => (
    <div className="space-y-3">
      {drivers.map((driver: Driver) => (
        <div key={driver.id} className="rounded-2xl border border-zinc-100 p-4 flex justify-between gap-4">
          <div>
            <p className="font-bold text-zinc-900">{driver.user?.name || 'Conductor'}</p>
            <p className="text-sm text-zinc-500">{driver.user?.email}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mt-1">{driver.licenseNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">{driver.status}</p>
            <p className="text-xs text-zinc-500">{driver.verificationStatus}</p>
          </div>
        </div>
      ))}
      {drivers.length === 0 && <div className="text-sm text-zinc-500">Sin conductores registrados.</div>}
    </div>
  );

  const renderLicenses = () => (
    <div className="space-y-3">
      {licenses.map((license: License) => (
        <div key={license.id} className="rounded-2xl border border-zinc-100 p-4 flex justify-between gap-4">
          <div>
            <p className="font-bold text-zinc-900">{license.licenseCode}</p>
            <p className="text-sm text-zinc-500">{license.municipality}</p>
            <p className="text-xs text-zinc-500">{license.ownerName}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">{license.isActive ? 'Activa' : 'Inactiva'}</p>
            <p className="text-xs text-zinc-500">{license.drivers?.length || 0} conductores</p>
          </div>
        </div>
      ))}
      {licenses.length === 0 && <div className="text-sm text-zinc-500">Sin licencias cargadas.</div>}
    </div>
  );

  const renderRules = () => (
    <div className="space-y-3">
      {rules.map((rule: PricingRule) => (
        <div key={rule.id} className="rounded-2xl border border-zinc-100 p-4 flex justify-between gap-4">
          <div>
            <p className="font-bold text-zinc-900">{rule.city}</p>
            <p className="text-sm text-zinc-500">Base {formatCurrency(rule.baseFare)} · Mínimo {formatCurrency(rule.minimumFare)}</p>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <p>Día {formatCurrency(rule.perKmDay)}/km</p>
            <p>Noche {formatCurrency(rule.perKmNight)}/km</p>
          </div>
        </div>
      ))}
      {rules.length === 0 && <div className="text-sm text-zinc-500">Sin reglas de precio definidas.</div>}
    </div>
  );


  return (
    <div className="flex h-screen font-sans bg-zinc-50">
      <aside className="w-64 bg-white border-r border-zinc-100 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-12 h-12 bg-zinc-900 rounded-lg flex items-center justify-center shadow-lg">
              <ShieldCheck className="text-white w-7 h-7" />
            </div>
            <div>
              <span className="font-black text-xl tracking-tighter uppercase italic">TaxiVTC</span>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Admin</p>
            </div>
          </div>
          <nav className="space-y-2">
            <button onClick={() => setView('map')} className={`w-full flex items-center gap-3 p-3 rounded-lg font-bold text-sm ${view === 'map' ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>
              <Map className="w-5 h-5" /> Live Map
            </button>
            <button onClick={() => setView('trips')} className={`w-full flex items-center gap-3 p-3 rounded-lg font-bold text-sm ${view === 'trips' ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>
              <List className="w-5 h-5" /> Trips ({trips.length})
            </button>
            <button onClick={() => setView('drivers')} className={`w-full flex items-center gap-3 p-3 rounded-lg font-bold text-sm ${view === 'drivers' ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>
              <Users className="w-5 h-5" /> Drivers ({drivers.length})
            </button>
            <button onClick={() => setView('licenses')} className={`w-full flex items-center gap-3 p-3 rounded-lg font-bold text-sm ${view === 'licenses' ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>
              <Car className="w-5 h-5" /> Licenses ({licenses.length})
            </button>
            <button onClick={() => setView('rules')} className={`w-full flex items-center gap-3 p-3 rounded-lg font-bold text-sm ${view === 'rules' ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>
              <DollarSign className="w-5 h-5" /> Pricing Rules ({rules.length})
            </button>
          </nav>
        </div>
        <button onClick={logout} className="w-full flex items-center gap-3 p-3 rounded-lg font-bold text-sm text-zinc-500 hover:bg-zinc-100">
          <LogOut className="w-5 h-5" /> Logout
        </button>
      </aside>
      
      <main className="flex-1 relative">
        {view === 'map' && (
          <Suspense fallback={<div className="h-full w-full flex items-center justify-center bg-zinc-100 text-zinc-500 text-sm font-medium">Cargando mapa...</div>}>
            <LiveMap liveDrivers={liveDrivers} />
          </Suspense>
        )}
        
        <div className={`p-8 ${view === 'map' ? 'hidden' : 'block'}`}>
          <h1 className="text-3xl font-black capitalize tracking-tighter">{view}</h1>
          <div className="grid grid-cols-4 gap-3 mt-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-zinc-100 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{card.label}</p>
                <p className="text-2xl font-black text-zinc-900 mt-2">{card.value}</p>
              </div>
            ))}
          </div>
          {error && (
            <div className="mt-4 bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium">
              {error}
            </div>
          )}
          <div className="mt-4 bg-white p-4 rounded-xl border border-zinc-100">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-zinc-500 text-sm font-medium">
                Cargando datos operativos...
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
        
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-white/80 backdrop-blur-sm p-2 rounded-xl border border-zinc-100 shadow-lg">
           <div className="flex items-center gap-2 px-4">
            <Users className="w-5 h-5 text-green-500" />
            <span className="font-bold text-zinc-900">{Object.keys(liveDrivers).length}</span>
            <span className="text-sm text-zinc-500">Drivers Online</span>
           </div>
        </div>
      </main>
    </div>
  );
}
