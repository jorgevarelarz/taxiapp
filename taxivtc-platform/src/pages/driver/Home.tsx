import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Navigation, LogOut, Car, User, Star, AlertCircle, TrendingUp, Wallet, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchJson } from '../../lib/api';
import { Logo, Card, Button, StatusDot, Spinner, MapContainer } from '../../components/ui';

const DriverMap = lazy(() => import('./DriverMap'));

export default function DriverHome() {
  const { token, logout } = useAuthStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'online' | 'offline' | 'busy'>('offline');
  const [todayEarnings, setTodayEarnings] = useState<{ total: number; trips: number; pctVsYesterday: number | null } | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [requestMetrics, setRequestMetrics] = useState<Record<string, { distanceMeters: number | null; durationSeconds: number | null }>>({});
  const [routeMetrics, setRouteMetrics] = useState<{
    pickup: { distanceMeters: number | null; durationSeconds: number | null } | null;
    trip: { distanceMeters: number | null; durationSeconds: number | null } | null;
  }>({ pickup: null, trip: null });
  const [uiError, setUiError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const toggleStatus = async () => {
    setUiError(null);
    const newStatus = status === 'offline' ? 'online' : 'offline';
    const res = await fetch('/api/driver/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) { setStatus(newStatus); return; }
    const errorData = await res.json().catch(() => ({ error: 'No se pudo cambiar el estado' }));
    setUiError(errorData.error || 'No se pudo cambiar el estado');
  };

  const fetchRequests = async () => {
    if (status !== 'online') return;
    const res = await fetch('/api/driver/requests', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudieron cargar las solicitudes' }));
      setUiError(errorData.error || 'No se pudieron cargar las solicitudes');
      return;
    }
    setRequests(await res.json());
  };

  useEffect(() => {
    const fetchActiveTrip = async () => {
      const res = await fetch('/api/driver/trips/active', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (data) { setActiveTrip(data); setStatus('busy'); }
    };
    fetchActiveTrip();
  }, [token]);

  useEffect(() => { fetchRequests(); }, [status, token]);

  useEffect(() => {
    fetchJson<{ today: { total: number; trips: number }; pctVsYesterday: number | null }>(
      '/api/driver/earnings', { headers: { Authorization: `Bearer ${token}` } }
    ).then((d) => setTodayEarnings({ total: d.today.total, trips: d.today.trips, pctVsYesterday: d.pctVsYesterday }))
     .catch(() => null);
  }, [token]);

  const handleAccept = async (tripId: string, offerId: string) => {
    const res = await fetch(`/api/driver/trips/${tripId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ offerId }),
    });
    if (res.ok) {
      setActiveTrip(await res.json());
      setStatus('busy');
      setRequests([]);
    } else {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo aceptar la solicitud' }));
      setUiError(errorData.error || 'No se pudo aceptar la solicitud');
      setRequests(requests.filter((r) => r.id !== tripId));
    }
  };

  const handleReject = async (tripId: string, offerId: string) => {
    const res = await fetch(`/api/driver/trips/${tripId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ offerId }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo rechazar la solicitud' }));
      setUiError(errorData.error || 'No se pudo rechazar la solicitud');
      return;
    }
    setRequests(requests.filter((r) => r.id !== tripId));
  };

  const updateTripStatus = async (tripStatus: string) => {
    const res = await fetch(`/api/driver/trips/${activeTrip.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: tripStatus }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo actualizar el viaje' }));
      setUiError(errorData.error || 'No se pudo actualizar el viaje');
      return;
    }
    const data = await res.json();
    setActiveTrip(data);
    if (tripStatus === 'no_show') { setActiveTrip(null); setStatus('online'); }
  };

  const collectPayment = async () => {
    const res = await fetch(`/api/driver/trips/${activeTrip.id}/payment/collect`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo registrar el cobro' }));
      setUiError(errorData.error || 'No se pudo registrar el cobro');
      return;
    }
    setActiveTrip(await res.json());
  };

  useEffect(() => {
    const eventSource = new EventSource('/api/events/trips');
    eventSource.addEventListener('new_trip', async () => {
      const res = await fetch('/api/driver/requests', { headers: { Authorization: `Bearer ${token}` } });
      setRequests(await res.json());
    });
    eventSource.addEventListener('trip_update', async (e) => {
      const updatedTrip = JSON.parse(e.data);
      if (activeTrip && updatedTrip.id === activeTrip.id) {
        const res = await fetch(`/api/driver/trips/${activeTrip.id}`, { headers: { Authorization: `Bearer ${token}` } });
        setActiveTrip(await res.json());
      } else {
        const res = await fetch('/api/driver/requests', { headers: { Authorization: `Bearer ${token}` } });
        setRequests(await res.json());
      }
    });
    return () => eventSource.close();
  }, [activeTrip?.id, token]);

  useEffect(() => {
    if ((status !== 'online' && status !== 'busy') || !token || !navigator.geolocation) {
      if (!navigator.geolocation) setGeoStatus('Geolocalización no disponible en este navegador');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        setGeoStatus(null);
        const nextLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCurrentLocation(nextLocation);
        try {
          await fetch('/api/driver/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ lat: nextLocation.lat, lng: nextLocation.lng, heading: position.coords.heading ?? undefined }),
          });
        } catch {
          setGeoStatus('No se pudo sincronizar la ubicación en este momento');
        }
      },
      () => setGeoStatus('Activa la ubicación para mejorar el mapa y el reparto'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [status, token]);

  const onlineColor = status === 'online' ? 'var(--accent)' : status === 'busy' ? 'var(--warn)' : 'var(--ink-4)';

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)' }} className="font-sans flex flex-col">

      {/* Header */}
      <header style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }} className="p-4 flex justify-between items-center sticky top-0 z-20 backdrop-blur-xl">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <button style={{ background: 'var(--panel-2)', borderRadius: 'var(--r-full)' }} className="p-2 relative">
            <Bell className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: 'var(--danger)', border: '2px solid var(--panel)' }} />
          </button>
          <button onClick={logout} className="p-2 rounded-full transition-colors hover:bg-white/5">
            <LogOut className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4 pb-24">
        {uiError && (
          <div style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)' }}
            className="border p-3 rounded-[var(--r-md)] text-sm font-medium">
            {uiError}
          </div>
        )}
        {geoStatus && (
          <div style={{ background: 'color-mix(in srgb, var(--warn) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--warn) 20%, transparent)', color: 'var(--warn)' }}
            className="border p-3 rounded-[var(--r-md)] text-sm font-medium">
            {geoStatus}
          </div>
        )}

        {/* Map */}
        <MapContainer height="260px">
          <Suspense fallback={
            <div className="h-full w-full flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--ink-3)' }}>
              <Spinner size={14} /> Cargando mapa...
            </div>
          }>
            <DriverMap
              currentLocation={currentLocation}
              activeTrip={activeTrip}
              requests={requests}
              onRouteMetricsChange={setRouteMetrics}
              onRequestMetricsChange={setRequestMetrics}
            />
          </Suspense>
        </MapContainer>

        {/* Route metrics */}
        {activeTrip && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Hasta recogida', data: routeMetrics.pickup },
              { label: 'Trayecto', data: routeMetrics.trip },
            ].map(({ label, data }) => (
              <Card key={label} variant="nested" className="p-4">
                <p className="text-eyebrow">{label}</p>
                <p className="text-xl font-bold mt-2" style={{ color: 'var(--ink)' }}>
                  {data?.durationSeconds ? `${Math.round(data.durationSeconds / 60)} min` : '--'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {data?.distanceMeters ? `${(data.distanceMeters / 1000).toFixed(1)} km` : 'Sin ruta'}
                </p>
              </Card>
            ))}
          </div>
        )}

        {/* Earnings */}
        <button onClick={() => navigate('/driver/earnings')} className="w-full text-left">
          <Card className="p-6 flex justify-between items-center overflow-hidden relative">
            <div>
              <p className="text-eyebrow">Ganancias hoy</p>
              <h2 className="text-3xl font-bold mt-2" style={{ color: 'var(--ink)' }}>
                {todayEarnings ? `${todayEarnings.total.toFixed(2)}€` : '—'}
              </h2>
              {todayEarnings?.pctVsYesterday != null && (
                <div className="flex items-center gap-1.5 mt-2"
                  style={{ color: todayEarnings.pctVsYesterday >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">
                    {todayEarnings.pctVsYesterday > 0 ? '+' : ''}{todayEarnings.pctVsYesterday}% vs ayer
                  </span>
                </div>
              )}
              {todayEarnings?.pctVsYesterday == null && todayEarnings && (
                <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                  {todayEarnings.trips} {todayEarnings.trips === 1 ? 'viaje' : 'viajes'}
                </p>
              )}
            </div>
            <Wallet className="w-20 h-20 absolute -right-3 -bottom-3 rotate-12 opacity-5" style={{ color: 'var(--ink)' }} />
          </Card>
        </button>

        {/* Status Toggle */}
        <Card className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot status={status} />
            <div>
              <p className="text-eyebrow">Modo de conducción</p>
              <h3 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
                {status === 'online' ? 'Disponible' : status === 'busy' ? 'En Servicio' : 'Desconectado'}
              </h3>
            </div>
          </div>
          <button
            onClick={toggleStatus}
            disabled={status === 'busy'}
            style={{
              width: 56,
              height: 32,
              borderRadius: 'var(--r-full)',
              background: status === 'offline' ? 'var(--panel-2)' : 'var(--accent)',
              boxShadow: status !== 'offline' ? 'var(--shadow-glow)' : 'none',
              position: 'relative',
              transition: 'all 0.3s',
              flexShrink: 0,
            }}
            className="disabled:opacity-50"
          >
            <motion.div
              animate={{ x: status === 'offline' ? 4 : 28 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{ position: 'absolute', top: 4, width: 24, height: 24, background: status === 'offline' ? 'var(--ink-4)' : 'var(--accent-ink)', borderRadius: '50%' }}
            />
          </button>
        </Card>

        {/* Active Trip */}
        <AnimatePresence>
          {activeTrip && (
            <motion.div key="active-trip" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <Card variant="light" className="p-6 space-y-6">
                {/* Passenger info */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center border border-zinc-200">
                      <User className="w-7 h-7 text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pasajero</p>
                      <h4 className="font-bold text-xl text-zinc-900 tracking-tight">{activeTrip.passenger?.user?.name}</h4>
                      <div className="flex items-center gap-1 text-yellow-500 mt-0.5">
                        <Star className="w-3 h-3 fill-current" />
                        <span className="text-xs font-bold">4.8</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-zinc-900">{activeTrip.agreedPrice.toFixed(2)}€</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Precio pactado</p>
                    <p className="text-[10px] font-mono text-zinc-400 mt-0.5">{activeTrip.bookingReference}</p>
                  </div>
                </div>

                {/* Route */}
                <div className="space-y-4 relative">
                  <div className="absolute left-2 top-3 bottom-3 w-px bg-zinc-200" />
                  {[
                    { label: 'Recogida', text: activeTrip.originText, dot: 'bg-zinc-900' },
                    { label: 'Destino', text: activeTrip.destinationText, dot: 'border-2 border-zinc-900 bg-white' },
                  ].map(({ label, text, dot }) => (
                    <div key={label} className="flex items-start gap-5 relative z-10">
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 mt-0.5 ${dot}`} />
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</p>
                        <p className="text-sm font-semibold text-zinc-900 leading-tight">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  {activeTrip.status === 'driver_en_route' && (
                    <button onClick={() => updateTripStatus('arrived_at_pickup')}
                      className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-zinc-800 transition-all active:scale-[0.98] shadow-lg">
                      He llegado al punto
                    </button>
                  )}
                  {activeTrip.status === 'arrived_at_pickup' && (
                    <div className="flex gap-3">
                      <button onClick={() => updateTripStatus('no_show')}
                        className="flex-1 bg-red-100 text-red-700 py-4 rounded-2xl font-bold hover:bg-red-200 transition-all active:scale-[0.98]">
                        No Show
                      </button>
                      <button onClick={() => updateTripStatus('passenger_on_board')}
                        className="flex-[2] py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
                        style={{ background: 'var(--ok)', color: 'var(--accent-ink)' }}>
                        Pasajero a bordo
                      </button>
                    </div>
                  )}
                  {activeTrip.status === 'passenger_on_board' && (
                    <button onClick={() => updateTripStatus('in_progress')}
                      className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-zinc-800 transition-all active:scale-[0.98]">
                      Iniciar Viaje
                    </button>
                  )}
                  {activeTrip.status === 'in_progress' && (
                    <button onClick={() => updateTripStatus('completed')}
                      className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
                      style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                      Finalizar Viaje
                    </button>
                  )}
                  {activeTrip.status === 'completed' && activeTrip.paymentStatus === 'pending' && activeTrip.paymentMethod === 'cash' && (
                    <button onClick={collectPayment}
                      className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
                      style={{ background: 'var(--ok)', color: 'var(--accent-ink)' }}>
                      Cobrar {activeTrip.finalPrice}€ en Efectivo
                    </button>
                  )}
                  {activeTrip.status === 'completed' && activeTrip.paymentStatus === 'processing' && activeTrip.paymentMethod === 'in_app' && (
                    <div className="w-full bg-zinc-100 text-zinc-400 py-4 rounded-2xl font-bold text-center flex items-center justify-center gap-2">
                      <Spinner size={14} className="text-zinc-400" /> Esperando pago en App...
                    </div>
                  )}
                  {activeTrip.status === 'completed' && activeTrip.paymentStatus === 'paid' && (
                    <button onClick={() => { setActiveTrip(null); setStatus('online'); }}
                      className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-zinc-800 transition-all active:scale-[0.98]">
                      Viaje Completado
                    </button>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Requests */}
        {!activeTrip && status === 'online' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <p className="text-eyebrow">Solicitudes cercanas</p>
              <span style={{ background: 'var(--panel-2)', color: 'var(--ink-3)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}
                className="text-eyebrow px-2 py-1">A Coruña</span>
            </div>
            <AnimatePresence mode="popLayout">
              {requests.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="p-14 flex flex-col items-center justify-center gap-4" style={{ border: '2px dashed var(--line-2)' }}>
                    <div className="relative">
                      <Car className="w-12 h-12 opacity-10" style={{ color: 'var(--ink)' }} />
                      <div style={{ border: '3px solid var(--line-2)', borderRadius: '50%' }} className="absolute inset-0 animate-ping" />
                    </div>
                    <p className="text-eyebrow">Escaneando zona...</p>
                  </Card>
                </motion.div>
              ) : (
                requests.map((req) => (
                  <motion.div
                    key={req.id}
                    layout
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                  >
                    <Card className="p-5 space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div style={{ width: 40, height: 40, background: 'var(--panel-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}
                            className="flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
                          </div>
                          <div>
                            <p className="font-semibold text-base" style={{ color: 'var(--ink)' }}>{req.passenger.user.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex items-center gap-1" style={{ color: 'var(--warn)' }}>
                                <Star className="w-3 h-3 fill-current" />
                                <span className="text-xs font-semibold">4.8</span>
                              </div>
                              {req.bookingReference && (
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--panel-2)', color: 'var(--ink-3)' }}>
                                  {req.bookingReference}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
                            {(req.agreedPrice || req.estimatedPrice).toFixed(2)}€
                          </span>
                        </div>
                      </div>

                      <Card variant="nested" className="p-3 space-y-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ink-4)' }} />
                          <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>{req.originText}</p>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full border" style={{ borderColor: 'var(--ink-3)' }} />
                          <p className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>{req.destinationText}</p>
                        </div>
                        {(req.routeDistanceMeters || req.routeDurationSeconds) && (
                          <div className="flex items-center gap-3 pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
                            {req.routeDistanceMeters && <span className="text-eyebrow">{(req.routeDistanceMeters / 1000).toFixed(1)} km</span>}
                            {req.routeDurationSeconds && <span className="text-eyebrow">{Math.round(req.routeDurationSeconds / 60)} min</span>}
                          </div>
                        )}
                        {requestMetrics[req.id] && (
                          <div className="flex items-center gap-3" style={{ color: 'var(--accent)' }}>
                            {requestMetrics[req.id]?.distanceMeters && (
                              <span className="text-eyebrow">A {(requestMetrics[req.id].distanceMeters! / 1000).toFixed(1)} km</span>
                            )}
                            {requestMetrics[req.id]?.durationSeconds && (
                              <span className="text-eyebrow">ETA {Math.round(requestMetrics[req.id].durationSeconds! / 60)} min</span>
                            )}
                          </div>
                        )}
                      </Card>

                      <div className="flex gap-3">
                        <Button variant="ghost" size="md" onClick={() => handleReject(req.id, req.offerId)} className="flex-1">
                          Rechazar
                        </Button>
                        <Button variant="primary" size="md" onClick={() => handleAccept(req.id, req.offerId)} className="flex-[2]">
                          Aceptar
                        </Button>
                      </div>

                      {/* Expiry timer */}
                      <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                        <motion.div
                          initial={{ width: '100%' }}
                          animate={{ width: '0%' }}
                          transition={{ duration: Math.max(0, (new Date(req.expiresAt).getTime() - Date.now()) / 1000), ease: 'linear' }}
                          className="h-full"
                          style={{ background: 'var(--accent)' }}
                        />
                      </div>
                    </Card>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Offline state */}
        {status === 'offline' && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
            <div className="relative">
              <div style={{ width: 80, height: 80, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)' }}
                className="flex items-center justify-center shadow-lg">
                <Car className="w-10 h-10" style={{ color: 'var(--ink-4)' }} />
              </div>
              <div style={{ background: 'var(--danger)', borderRadius: 'var(--r-sm)' }} className="absolute -top-2 -right-2 p-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>Sin Conexión</h3>
              <p className="text-sm max-w-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                Ponte en línea para empezar a recibir servicios y generar ingresos hoy.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav style={{ background: 'var(--panel)', borderTop: '1px solid var(--line)' }}
        className="fixed bottom-0 left-0 right-0 p-4 flex justify-around items-center z-20">
        <button className="flex flex-col items-center gap-1">
          <Navigation className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-eyebrow" style={{ color: 'var(--accent)' }}>Mapa</span>
        </button>
        <button onClick={() => navigate('/driver/earnings')} className="flex flex-col items-center gap-1">
          <TrendingUp className="w-5 h-5" style={{ color: 'var(--ink-4)' }} />
          <span className="text-eyebrow" style={{ color: 'var(--ink-4)' }}>Ingresos</span>
        </button>
        <button onClick={() => navigate('/driver/profile')} className="flex flex-col items-center gap-1">
          <User className="w-5 h-5" style={{ color: 'var(--ink-4)' }} />
          <span className="text-eyebrow" style={{ color: 'var(--ink-4)' }}>Perfil</span>
        </button>
      </nav>
    </div>
  );
}
