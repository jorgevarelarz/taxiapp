import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { MapPin, Navigation, LogOut, Car, CheckCircle2, User, Star, AlertCircle, TrendingUp, Wallet, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DriverMap = lazy(() => import('./DriverMap'));

export default function DriverHome() {
  const { user, token, logout } = useAuthStore();
  const [status, setStatus] = useState<'online' | 'offline' | 'busy'>('offline');
  const [requests, setRequests] = useState<any[]>([]);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [requestMetrics, setRequestMetrics] = useState<Record<string, {
    distanceMeters: number | null;
    durationSeconds: number | null;
  }>>({});
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
    if (res.ok) {
      setStatus(newStatus);
      return;
    }
    const errorData = await res.json().catch(() => ({ error: 'No se pudo cambiar el estado' }));
    setUiError(errorData.error || 'No se pudo cambiar el estado');
  };

  const fetchRequests = async () => {
    if (status !== 'online') return;
    const res = await fetch('/api/driver/requests', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudieron cargar las solicitudes' }));
      setUiError(errorData.error || 'No se pudieron cargar las solicitudes');
      return;
    }
    const data = await res.json();
    setRequests(data);
  };

  useEffect(() => {
    const fetchActiveTrip = async () => {
      const res = await fetch('/api/driver/trips/active', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data) {
        setActiveTrip(data);
        setStatus('busy');
      }
    };
    fetchActiveTrip();
  }, [token]);

  useEffect(() => {
    fetchRequests();
  }, [status, token]);

  const handleAccept = async (tripId: string, offerId: string) => {
    const res = await fetch(`/api/driver/trips/${tripId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ offerId })
    });
    if (res.ok) {
      const data = await res.json();
      setActiveTrip(data);
      setStatus('busy');
      setRequests([]);
    } else {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo aceptar la solicitud' }));
      setUiError(errorData.error || 'No se pudo aceptar la solicitud');
      // If expired or invalid, remove from list
      setRequests(requests.filter(r => r.id !== tripId));
    }
  };

  const handleReject = async (tripId: string, offerId: string) => {
    const res = await fetch(`/api/driver/trips/${tripId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ offerId })
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo rechazar la solicitud' }));
      setUiError(errorData.error || 'No se pudo rechazar la solicitud');
      return;
    }
    setRequests(requests.filter(r => r.id !== tripId));
  };

  const updateTripStatus = async (status: string) => {
    const res = await fetch(`/api/driver/trips/${activeTrip.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo actualizar el viaje' }));
      setUiError(errorData.error || 'No se pudo actualizar el viaje');
      return;
    }
    const data = await res.json();
    setActiveTrip(data);
    if (status === 'no_show') {
      setActiveTrip(null);
      setStatus('online');
    }
  };

  const collectPayment = async () => {
    const res = await fetch(`/api/driver/trips/${activeTrip.id}/payment/collect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'No se pudo registrar el cobro' }));
      setUiError(errorData.error || 'No se pudo registrar el cobro');
      return;
    }
    const data = await res.json();
    setActiveTrip(data);
  };

  useEffect(() => {
    const eventSource = new EventSource('/api/events/trips');

    eventSource.addEventListener('new_trip', async (e) => {
      // Refresh requests when a new trip is offered
      const res = await fetch('/api/driver/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setRequests(data);
    });

    eventSource.addEventListener('trip_update', async (e) => {
      const updatedTrip = JSON.parse(e.data);
      if (activeTrip && updatedTrip.id === activeTrip.id) {
        // Fetch full trip details
        const res = await fetch(`/api/driver/trips/${activeTrip.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setActiveTrip(data);
      } else {
        // Might be an offer expiration or other update, refresh requests
        const res = await fetch('/api/driver/requests', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setRequests(data);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [activeTrip?.id, token]);

  useEffect(() => {
    if ((status !== 'online' && status !== 'busy') || !token || !navigator.geolocation) {
      if (!navigator.geolocation) {
        setGeoStatus('Geolocalización no disponible en este navegador');
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        setGeoStatus(null);
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentLocation(nextLocation);

        try {
          await fetch('/api/driver/location', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              lat: nextLocation.lat,
              lng: nextLocation.lng,
              heading: position.coords.heading ?? undefined,
            }),
          });
        } catch {
          setGeoStatus('No se pudo sincronizar la ubicación en este momento');
        }
      },
      () => {
        setGeoStatus('Activa la ubicación para mejorar el mapa y el reparto');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [status, token]);

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-white flex flex-col">
      {/* Header */}
      <header className="bg-zinc-900/50 backdrop-blur-xl p-4 flex justify-between items-center border-b border-zinc-800 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-xl">
            <Car className="text-zinc-900 w-6 h-6" />
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tighter uppercase italic">Driver Pro</h1>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">A Coruña • LIC-1234</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <button className="p-2 bg-zinc-800 rounded-full relative">
             <Bell className="w-5 h-5 text-zinc-400" />
             <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-zinc-900"></div>
           </button>
           <button onClick={logout} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <LogOut className="w-5 h-5 text-zinc-500" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6 pb-24">
        {uiError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-4 text-sm font-medium">
            {uiError}
          </div>
        )}

        {geoStatus && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-100 rounded-2xl p-4 text-sm font-medium">
            {geoStatus}
          </div>
        )}

        <div className="h-64 bg-zinc-900 rounded-[2.5rem] overflow-hidden border border-zinc-800 shadow-2xl">
          <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-zinc-500 text-sm font-medium">Cargando mapa...</div>}>
            <DriverMap
              currentLocation={currentLocation}
              activeTrip={activeTrip}
              requests={requests}
              onRouteMetricsChange={setRouteMetrics}
              onRequestMetricsChange={setRequestMetrics}
            />
          </Suspense>
        </div>

        {activeTrip && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 rounded-[1.75rem] p-5 border border-zinc-800 shadow-xl">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Hasta Recogida</p>
              <p className="text-2xl font-black tracking-tighter mt-2">
                {routeMetrics.pickup?.durationSeconds ? `${Math.round(routeMetrics.pickup.durationSeconds / 60)} min` : '--'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {routeMetrics.pickup?.distanceMeters ? `${(routeMetrics.pickup.distanceMeters / 1000).toFixed(1)} km` : 'Sin ruta'}
              </p>
            </div>
            <div className="bg-zinc-900 rounded-[1.75rem] p-5 border border-zinc-800 shadow-xl">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Trayecto</p>
              <p className="text-2xl font-black tracking-tighter mt-2">
                {routeMetrics.trip?.durationSeconds ? `${Math.round(routeMetrics.trip.durationSeconds / 60)} min` : '--'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {routeMetrics.trip?.distanceMeters ? `${(routeMetrics.trip.distanceMeters / 1000).toFixed(1)} km` : 'Sin ruta'}
              </p>
            </div>
          </div>
        )}

        {/* Earnings Card */}
        <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-[2.5rem] p-8 shadow-2xl border border-zinc-700/50 flex justify-between items-center overflow-hidden relative">
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Ganancias Hoy</p>
            <h2 className="text-4xl font-black tracking-tighter">124.50€</h2>
            <div className="flex items-center gap-2 mt-2">
               <TrendingUp className="w-4 h-4 text-green-400" />
               <span className="text-xs font-bold text-green-400">+15% vs ayer</span>
            </div>
          </div>
          <Wallet className="w-24 h-24 text-white/5 absolute -right-4 -bottom-4 rotate-12" />
          <button className="bg-white text-zinc-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">
            Retirar
          </button>
        </div>

        {/* Status Toggle */}
        <div className="bg-zinc-900 rounded-[2rem] p-6 border border-zinc-800 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${status === 'online' ? 'bg-green-500 animate-pulse' : status === 'busy' ? 'bg-yellow-500' : 'bg-zinc-700'}`}></div>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Modo de Conducción</p>
              <h3 className="text-xl font-black tracking-tight uppercase italic">
                {status === 'online' ? 'Disponible' : status === 'busy' ? 'En Servicio' : 'Desconectado'}
              </h3>
            </div>
          </div>
          <button
            onClick={toggleStatus}
            disabled={status === 'busy'}
            className={`w-16 h-9 rounded-full relative transition-all duration-500 ${status === 'offline' ? 'bg-zinc-800' : 'bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.3)]'}`}
          >
            <motion.div
              animate={{ x: status === 'offline' ? 4 : 32 }}
              className="absolute top-1.5 w-6 h-6 bg-white rounded-full shadow-2xl"
            />
          </button>
        </div>

        {/* Active Trip Panel */}
        <AnimatePresence>
          {activeTrip && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white text-zinc-900 rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center border border-zinc-200 shadow-inner">
                    <User className="text-zinc-900 w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pasajero</p>
                    <h4 className="font-black text-2xl tracking-tighter">{activeTrip.passenger?.user?.name}</h4>
                    <div className="flex items-center gap-1 text-zinc-400 mt-1">
                      <Star className="w-3 h-3 fill-current text-yellow-400" />
                      <span className="text-xs font-bold">4.8</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black tracking-tighter">{activeTrip.agreedPrice.toFixed(2)}€</p>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Precio Pactado</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Ref: {activeTrip.bookingReference}</p>
                </div>
              </div>

              <div className="space-y-6 relative">
                <div className="absolute left-2.5 top-3 bottom-3 w-0.5 bg-zinc-100"></div>
                <div className="flex items-start gap-6 relative z-10">
                  <div className="w-5 h-5 bg-zinc-900 rounded-full border-4 border-white shadow-lg flex-shrink-0"></div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Recogida</p>
                    <p className="font-bold text-sm leading-tight">{activeTrip.originText}</p>
                  </div>
                </div>
                <div className="flex items-start gap-6 relative z-10">
                  <div className="w-5 h-5 bg-white border-4 border-zinc-900 rounded-full shadow-lg flex-shrink-0"></div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Destino</p>
                    <p className="font-black text-sm leading-tight">{activeTrip.destinationText}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {activeTrip.status === 'driver_en_route' && (
                  <button
                    onClick={() => updateTripStatus('arrived_at_pickup')}
                    className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-black text-xl hover:bg-zinc-800 shadow-xl active:scale-95 transition-all"
                  >
                    He llegado al punto
                  </button>
                )}
                {activeTrip.status === 'arrived_at_pickup' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => updateTripStatus('no_show')}
                      className="flex-1 bg-red-100 text-red-700 py-5 rounded-2xl font-black text-lg hover:bg-red-200 shadow-xl active:scale-95 transition-all"
                    >
                      No Show
                    </button>
                    <button
                      onClick={() => updateTripStatus('passenger_on_board')}
                      className="flex-[2] bg-green-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-green-700 shadow-xl active:scale-95 transition-all"
                    >
                      Pasajero a bordo
                    </button>
                  </div>
                )}
                {activeTrip.status === 'passenger_on_board' && (
                  <button
                    onClick={() => updateTripStatus('in_progress')}
                    className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-black text-xl hover:bg-zinc-800 shadow-xl active:scale-95 transition-all"
                  >
                    Iniciar Viaje
                  </button>
                )}
                {activeTrip.status === 'in_progress' && (
                  <button
                    onClick={() => updateTripStatus('completed')}
                    className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-black text-xl hover:bg-zinc-800 shadow-xl active:scale-95 transition-all"
                  >
                    Finalizar Viaje
                  </button>
                )}
                {activeTrip.status === 'completed' && activeTrip.paymentStatus === 'pending' && activeTrip.paymentMethod === 'cash' && (
                  <button
                    onClick={collectPayment}
                    className="w-full bg-green-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-green-700 shadow-xl active:scale-95 transition-all"
                  >
                    Cobrar {activeTrip.finalPrice}€ en Efectivo
                  </button>
                )}
                {activeTrip.status === 'completed' && activeTrip.paymentStatus === 'processing' && activeTrip.paymentMethod === 'in_app' && (
                  <div className="w-full bg-zinc-800 text-zinc-400 py-5 rounded-2xl font-black text-center flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
                    Esperando pago en App...
                  </div>
                )}
                {activeTrip.status === 'completed' && activeTrip.paymentStatus === 'paid' && (
                  <button
                    onClick={() => {
                      setActiveTrip(null);
                      setStatus('online');
                    }}
                    className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-black text-xl hover:bg-zinc-800 shadow-xl active:scale-95 transition-all"
                  >
                    Viaje Completado
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Requests List */}
        {!activeTrip && status === 'online' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
               <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Solicitudes Cercanas</h3>
               <span className="bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest">A Coruña</span>
            </div>
            <AnimatePresence mode="popLayout">
              {requests.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="bg-zinc-900/50 rounded-[2rem] p-16 flex flex-col items-center justify-center text-zinc-600 gap-4 border-2 border-dashed border-zinc-800"
                >
                  <div className="relative">
                    <Car className="w-16 h-16 opacity-10" />
                    <div className="absolute inset-0 border-4 border-zinc-800 rounded-full animate-ping"></div>
                  </div>
                  <p className="font-black uppercase tracking-widest text-xs italic">Escaneando zona...</p>
                </motion.div>
              ) : (
                requests.map((req) => (
                  <motion.div
                    key={req.id}
                    layout
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    className="bg-zinc-900 rounded-[2rem] p-6 border border-zinc-800 space-y-6 shadow-2xl group hover:border-zinc-700 transition-all"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center">
                           <User className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div>
                          <p className="font-black text-lg tracking-tight">{req.passenger.user.name}</p>
                          <div className="flex items-center gap-2">
                             <div className="flex items-center gap-1 text-yellow-500">
                               <Star className="w-3 h-3 fill-current" />
                               <span className="text-[10px] font-bold">4.8</span>
                             </div>
                             {req.bookingReference && (
                               <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                                 {req.bookingReference}
                               </span>
                             )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                         <span className="text-3xl font-black tracking-tighter text-white">{(req.agreedPrice || req.estimatedPrice).toFixed(2)}€</span>
                         <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Precio Pactado</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full"></div>
                        <p className="text-xs text-zinc-400 truncate font-medium">{req.originText}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 border border-zinc-600 rounded-full"></div>
                        <p className="text-xs text-zinc-200 truncate font-bold">{req.destinationText}</p>
                      </div>
                      {(req.routeDistanceMeters || req.routeDurationSeconds) && (
                        <div className="flex items-center gap-4 pt-2 mt-2 border-t border-zinc-800/50 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          {req.routeDistanceMeters && <span>{(req.routeDistanceMeters / 1000).toFixed(1)} km</span>}
                          {req.routeDurationSeconds && <span>{Math.round(req.routeDurationSeconds / 60)} min</span>}
                        </div>
                      )}
                      {requestMetrics[req.id] && (
                        <div className="flex items-center gap-4 text-[10px] font-bold text-green-400 uppercase tracking-widest">
                          {requestMetrics[req.id]?.distanceMeters && (
                            <span>A { (requestMetrics[req.id].distanceMeters! / 1000).toFixed(1) } km</span>
                          )}
                          {requestMetrics[req.id]?.durationSeconds && (
                            <span>ETA { Math.round(requestMetrics[req.id].durationSeconds! / 60) } min</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleReject(req.id, req.offerId)}
                        className="flex-1 bg-zinc-800 text-white py-4 rounded-xl font-black text-lg hover:bg-zinc-700 transition-all active:scale-[0.98] shadow-xl"
                      >
                        Rechazar
                      </button>
                      <button
                        onClick={() => handleAccept(req.id, req.offerId)}
                        className="flex-[2] bg-white text-zinc-900 py-4 rounded-xl font-black text-lg hover:bg-zinc-100 transition-all active:scale-[0.98] shadow-xl"
                      >
                        Aceptar
                      </button>
                    </div>
                    <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: Math.max(0, (new Date(req.expiresAt).getTime() - Date.now()) / 1000), ease: "linear" }}
                        className="h-full bg-white"
                      />
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        )}

        {status === 'offline' && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="relative">
               <div className="w-24 h-24 bg-zinc-900 rounded-[2rem] flex items-center justify-center border border-zinc-800 shadow-2xl">
                <Car className="w-12 h-12 text-zinc-700" />
              </div>
              <div className="absolute -top-2 -right-2 bg-red-500 p-2 rounded-xl shadow-lg">
                 <AlertCircle className="w-4 h-4 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tighter uppercase italic">Sin Conexión</h3>
              <p className="text-zinc-500 text-sm max-w-xs mt-2 font-medium">Ponte en línea para empezar a recibir servicios y generar ingresos hoy.</p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/80 backdrop-blur-xl border-t border-zinc-800 p-4 flex justify-around items-center z-20">
        <button className="flex flex-col items-center gap-1 text-white">
          <Navigation className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-widest">Mapa</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-zinc-600">
          <TrendingUp className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-widest">Ingresos</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-zinc-600">
          <User className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-widest">Perfil</span>
        </button>
      </nav>
    </div>
  );
}
