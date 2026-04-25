import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { MapPin, Search, Clock, CreditCard, Star, LogOut, Car, ChevronRight, History, User, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, useJsApiLoader, Autocomplete, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { fetchJson } from '../../lib/api';
import { Logo, Button, Card, MapContainer, Spinner, StatusDot } from '../../components/ui';

const containerStyle = { width: '100%', height: '100%' };
const center = { lat: 43.3623, lng: -8.4115 };
const libraries: 'places'[] = ['places'];

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#17171B' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E6E78' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#09090B' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#24242A' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2E2E35' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3F3F48' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#B5B5BD' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#09090B' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function PassengerHome() {
  const { token, logout } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<'idle' | 'quoting' | 'searching' | 'on-trip' | 'payment'>('idle');
  const [origin, setOrigin] = useState({ text: 'Calle Real, 12, A Coruña', coords: { lat: 43.369, lng: -8.406 } });
  const [destination, setDestination] = useState<{ text: string; coords: { lat: number; lng: number } | null }>({ text: '', coords: null });
  const [quote, setQuote] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'in_app' | 'cash'>('in_app');
  const [directions, setDirections] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; heading: number } | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [ratingTripId, setRatingTripId] = useState<string | null>(null);
  const [ratingScore, setRatingScore] = useState(0);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [isRequestingTrip, setIsRequestingTrip] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const originAutocompleteRef = useRef<any>(null);
  const destinationAutocompleteRef = useRef<any>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY!,
    libraries,
  });

  const handleQuote = async () => {
    if (!destination.text) return;
    setUiError(null);
    setStep('quoting');
    setIsSubmittingQuote(true);
    setDirections(null);
    try {
      const data = await fetchJson<any>('/api/passenger/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ originText: origin.text, destinationText: destination.text }),
      });
      setQuote(data);
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        { origin: data.origin.coords, destination: data.destination.coords, travelMode: window.google.maps.TravelMode.DRIVING },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            setDirections(result);
          } else {
            setUiError('No se pudo calcular la ruta visual del viaje');
          }
        }
      );
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'No se pudo calcular el presupuesto');
      setStep('idle');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  const handleRequest = async () => {
    setUiError(null);
    setStep('searching');
    setIsRequestingTrip(true);
    const { origin, destination, estimatedPrice, distanceMeters, durationSeconds, pricingRuleId, breakdown } = quote;
    try {
      const data = await fetchJson<any>('/api/passenger/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origin, destination, agreedPrice: estimatedPrice, distanceMeters, durationSeconds, pricingRuleId, breakdown, paymentMethod }),
      });
      setActiveTrip(data);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'No se pudo solicitar el viaje');
      setStep('quoting');
    } finally {
      setIsRequestingTrip(false);
    }
  };

  const resetTrip = (tripId: string) => {
    setRatingTripId(tripId);
    setRatingScore(0);
    setStep('idle');
    setDestination({ text: '', coords: null });
    setQuote(null);
    setActiveTrip(null);
  };

  const handlePaymentConfirm = async () => {
    setUiError(null);
    setIsPaying(true);
    try {
      const data = await fetchJson<any>(`/api/passenger/trips/${activeTrip.id}/payment/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveTrip(data);
      if (data.paymentStatus === 'paid') {
        resetTrip(data.id);
      }
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'No se pudo completar el pago');
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancelTrip = async () => {
    setIsCancelling(true);
    try {
      if (activeTrip?.id) {
        await fetchJson(`/api/passenger/trips/${activeTrip.id}/cancel`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
      }
      setShowCancelModal(false);
      setStep('idle');
      setActiveTrip(null);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'No se pudo cancelar el viaje');
      setShowCancelModal(false);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!ratingTripId || ratingScore === 0) return;
    setIsSubmittingRating(true);
    try {
      await fetchJson(`/api/passenger/trips/${ratingTripId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ score: ratingScore }),
      });
    } catch {
      // rating failure is non-blocking
    } finally {
      setIsSubmittingRating(false);
      setRatingTripId(null);
    }
  };

  useEffect(() => {
    const fetchActiveTrip = async () => {
      setIsBootstrapping(true);
      try {
        const data = await fetchJson<any | null>('/api/passenger/trips/active', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data) {
          setActiveTrip(data);
          if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'no_show') {
            if (data.paymentStatus !== 'paid') setStep('payment');
          } else if (['driver_en_route', 'arrived_at_pickup', 'passenger_on_board', 'in_progress'].includes(data.status)) {
            setStep('on-trip');
          } else if (data.status === 'requested') {
            setStep('searching');
          }
        }
      } catch (error) {
        setUiError(error instanceof Error ? error.message : 'No se pudo restaurar el viaje activo');
      } finally {
        setIsBootstrapping(false);
      }
    };
    fetchActiveTrip();
  }, [token]);

  useEffect(() => {
    if (!activeTrip || activeTrip.paymentStatus === 'paid') return;
    const eventSource = new EventSource(`/api/events/trips?tripId=${activeTrip.id}`);
    eventSource.addEventListener('trip_update', async () => {
      try {
        const data = await fetchJson<any>(`/api/passenger/trips/${activeTrip.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setActiveTrip(data);
        if (data.status === 'completed') {
          if (data.paymentStatus === 'paid') { resetTrip(data.id); }
          else setStep('payment');
        } else if (data.status === 'cancelled' || data.status === 'no_show') {
          if (data.paymentStatus === 'paid') { resetTrip(data.id); }
          else setStep('payment');
        } else if (['driver_en_route', 'arrived_at_pickup', 'passenger_on_board', 'in_progress'].includes(data.status)) {
          setStep('on-trip');
        }
      } catch {
        setUiError('No se pudo refrescar el estado del viaje');
      }
    });
    return () => eventSource.close();
  }, [activeTrip?.id, token]);

  useEffect(() => {
    if (step !== 'on-trip' || !activeTrip?.driver?.id) return;
    const eventSource = new EventSource('/api/events/drivers');
    eventSource.addEventListener('driver_location_update', (e) => {
      setDriverLocation(JSON.parse(e.data));
    });
    return () => eventSource.close();
  }, [step, activeTrip?.driver?.id, token]);

  const tripStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      driver_en_route: 'Conductor en camino',
      arrived_at_pickup: 'Taxi en el punto',
      passenger_on_board: 'Pasajero a bordo',
      in_progress: 'Viaje en curso',
    };
    return map[s] ?? s;
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--ink)' }} className="font-sans flex flex-col">

      {/* Header */}
      <header style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }} className="p-4 flex justify-between items-center sticky top-0 z-20">
        <Logo size="sm" />
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full transition-colors hover:bg-white/5">
            <History className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
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

        {/* Map */}
        <MapContainer height="260px">
          {!isLoaded ? (
            <div className="h-full w-full flex items-center justify-center text-sm gap-2" style={{ color: 'var(--ink-3)' }}>
              <Spinner size={14} /> Cargando mapa...
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={driverLocation || center}
              zoom={15}
              options={{ disableDefaultUI: true, gestureHandling: 'none', styles: DARK_MAP_STYLES }}
            >
              {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />}
              {driverLocation && (
                <Marker
                  position={driverLocation}
                  icon={{
                    path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 6,
                    rotation: driverLocation.heading,
                    fillColor: '#D4FF3A',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: '#09090B',
                  }}
                />
              )}
            </GoogleMap>
          )}
        </MapContainer>

        {/* Step panels */}
        <AnimatePresence mode="wait">

          {/* IDLE */}
          {step === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <Card className="p-6 space-y-5">
                <p className="text-eyebrow">¿A dónde vamos?</p>

                {isLoaded && (
                  <div className="space-y-1">
                    {/* Origin */}
                    <div className="flex items-center gap-3 group py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                      <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-eyebrow mb-1">Recogida</p>
                        <Autocomplete
                          onLoad={(ref) => (originAutocompleteRef.current = ref)}
                          onPlaceChanged={() => {
                            if (originAutocompleteRef.current) {
                              const place = originAutocompleteRef.current.getPlace();
                              setOrigin({ text: place.formatted_address, coords: { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() } });
                            }
                          }}
                        >
                          <input
                            type="text"
                            value={origin.text}
                            onChange={(e) => setOrigin({ ...origin, text: e.target.value })}
                            className="w-full bg-transparent outline-none text-sm font-medium placeholder:text-[var(--ink-4)]"
                            style={{ color: 'var(--ink)' }}
                            placeholder="¿Dónde te recogemos?"
                          />
                        </Autocomplete>
                      </div>
                    </div>

                    {/* Destination */}
                    <div className="flex items-center gap-3 group py-3">
                      <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-eyebrow mb-1">Destino</p>
                        <Autocomplete
                          onLoad={(ref) => (destinationAutocompleteRef.current = ref)}
                          onPlaceChanged={() => {
                            if (destinationAutocompleteRef.current) {
                              const place = destinationAutocompleteRef.current.getPlace();
                              setDestination({ text: place.formatted_address, coords: { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() } });
                            }
                          }}
                        >
                          <input
                            type="text"
                            value={destination.text}
                            onChange={(e) => setDestination({ ...destination, text: e.target.value })}
                            className="w-full bg-transparent outline-none text-sm font-medium placeholder:text-[var(--ink-4)]"
                            style={{ color: 'var(--ink)' }}
                            placeholder="¿A dónde vas?"
                          />
                        </Autocomplete>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleQuote}
                  disabled={!destination.coords || isSubmittingQuote}
                  loading={isSubmittingQuote}
                >
                  {isSubmittingQuote ? 'Calculando...' : 'Solicitar Presupuesto'}
                  {!isSubmittingQuote && <ChevronRight className="w-4 h-4" />}
                </Button>
              </Card>
            </motion.div>
          )}

          {/* QUOTING */}
          {step === 'quoting' && quote && (
            <motion.div key="quoting" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="p-6 space-y-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-eyebrow mb-1">Precio cerrado</p>
                    <h3 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>Acuerdo de servicio</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>{quote.estimatedPrice.toFixed(2)}€</p>
                    <div className="flex items-center justify-end gap-1 mt-1" style={{ color: 'var(--ok)' }}>
                      <ShieldCheck className="w-3 h-3" />
                      <span className="text-eyebrow">Garantizado</span>
                    </div>
                  </div>
                </div>

                <Card variant="nested" className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-eyebrow">Distancia</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{(quote.distanceMeters / 1000).toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-eyebrow">Tiempo estimado</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>~{Math.round(quote.durationSeconds / 60)} min</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--line)' }} />
                  <div className="flex justify-between">
                    <span className="text-eyebrow">Tarifa {quote.city}</span>
                    <span className="text-eyebrow" style={{ color: 'var(--accent)' }}>Aplicada</span>
                  </div>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <Card variant="nested" className="p-4 flex flex-col items-center gap-2">
                    <Clock className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Recogida inmediata</span>
                    <span className="text-eyebrow">Disponibilidad</span>
                  </Card>
                  <button
                    onClick={() => setPaymentMethod((prev) => (prev === 'in_app' ? 'cash' : 'in_app'))}
                    style={{ background: 'var(--panel-2)', borderColor: 'var(--line)', borderRadius: 'var(--r-md)' }}
                    className="p-4 flex flex-col items-center gap-2 border transition-colors hover:brightness-110"
                  >
                    <CreditCard className="w-5 h-5" style={{ color: paymentMethod === 'in_app' ? 'var(--accent)' : 'var(--ink-3)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{paymentMethod === 'in_app' ? 'Pago App' : 'Efectivo'}</span>
                    <span className="text-eyebrow">Cambiar</span>
                  </button>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button variant="ghost" size="lg" onClick={() => setStep('idle')} className="flex-1">
                    Atrás
                  </Button>
                  <Button variant="primary" size="lg" onClick={handleRequest} disabled={isRequestingTrip} loading={isRequestingTrip} className="flex-[2]">
                    {isRequestingTrip ? 'Solicitando...' : 'Pedir Ahora'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {/* SEARCHING */}
          {step === 'searching' && (
            <motion.div key="searching" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-10 flex flex-col items-center space-y-6 text-center">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  {activeTrip?.dispatchStatus === 'no_driver_found' ? (
                    <div style={{ width: 80, height: 80, border: '6px solid color-mix(in srgb, var(--danger) 20%, transparent)', borderRadius: '50%' }}
                      className="flex items-center justify-center">
                      <Car className="w-10 h-10" style={{ color: 'var(--danger)' }} />
                    </div>
                  ) : (
                    <>
                      <div style={{ width: 80, height: 80, border: '4px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%' }}
                        className="animate-spin absolute" />
                      <Car className="w-9 h-9" style={{ color: 'var(--accent)' }} />
                    </>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-semibold" style={{ color: 'var(--ink)', fontFamily: 'var(--font-serif)' }}>
                    {activeTrip?.dispatchStatus === 'no_driver_found' ? 'Sin conductores' : 'Buscando taxi'}
                  </h3>
                  <p className="text-sm mt-2" style={{ color: 'var(--ink-3)' }}>
                    {activeTrip?.dispatchStatus === 'no_driver_found'
                      ? 'No hay conductores disponibles ahora. Inténtalo en unos minutos.'
                      : 'Asignando el vehículo más cercano en A Coruña.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (activeTrip?.dispatchStatus === 'no_driver_found') {
                      setStep('idle'); setActiveTrip(null);
                    } else {
                      setShowCancelModal(true);
                    }
                  }}
                  className="text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: activeTrip?.dispatchStatus === 'no_driver_found' ? 'var(--accent)' : 'var(--ink-3)' }}
                >
                  {activeTrip?.dispatchStatus === 'no_driver_found' ? 'Volver al inicio' : 'Cancelar'}
                </button>
              </Card>
            </motion.div>
          )}

          {/* ON TRIP */}
          {step === 'on-trip' && activeTrip && (
            <motion.div key="on-trip" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-6 space-y-5">
                {/* Driver info */}
                <Card variant="nested" className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div style={{ width: 48, height: 48, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}
                        className="flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6" style={{ color: 'var(--ink-2)' }} />
                      </div>
                      <div>
                        <p className="text-eyebrow">Conductor</p>
                        <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{activeTrip.driver?.user?.name || 'En camino'}</p>
                        {activeTrip.driver?.ratingCount > 0 && (
                          <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--warn)' }}>
                            <Star className="w-3 h-3 fill-current" />
                            <span className="text-xs font-semibold">{activeTrip.driver.ratingAvg.toFixed(1)}</span>
                            <span className="text-eyebrow">({activeTrip.driver.ratingCount})</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', color: 'var(--ink-2)' }}
                      className="text-xs font-mono px-2.5 py-1 inline-block">
                      {activeTrip.driver?.licenseNumber || 'LIC-1234'}
                    </span>
                  </div>

                  {/* Vehículo */}
                  {activeTrip.driver?.taxiLicense?.vehicles?.[0] && (() => {
                    const v = activeTrip.driver.taxiLicense.vehicles[0];
                    return (
                      <div style={{ borderTop: '1px solid var(--line)' }} className="pt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                            {v.model} · {v.color}
                          </span>
                        </div>
                        <span style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', color: 'var(--accent)' }}
                          className="text-xs font-mono font-bold px-2.5 py-1">
                          {v.plate}
                        </span>
                      </div>
                    );
                  })()}
                </Card>

                {/* Route */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--accent)' }} />
                    <div>
                      <p className="text-eyebrow">Recogida</p>
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{activeTrip.originText}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 border-2" style={{ borderColor: 'var(--ink)', background: 'transparent' }} />
                    <div>
                      <p className="text-eyebrow">Destino</p>
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{activeTrip.destinationText}</p>
                    </div>
                  </div>
                </div>

                {/* Status + Price */}
                <div style={{ borderTop: '1px solid var(--line)' }} className="pt-4 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusDot status="online" />
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{tripStatusLabel(activeTrip.status)}</span>
                    </div>
                    <p className="text-eyebrow mt-1">Ref: {activeTrip.bookingReference}</p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{activeTrip.agreedPrice.toFixed(2)}€</p>
                </div>
              </Card>
            </motion.div>
          )}

          {/* PAYMENT */}
          {step === 'payment' && activeTrip && (
            <motion.div key="payment" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-8 space-y-6 text-center">
                <div style={{ width: 72, height: 72, background: 'color-mix(in srgb, var(--ok) 12%, transparent)', borderRadius: '50%' }}
                  className="flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-9 h-9" style={{ color: 'var(--ok)' }} />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>Viaje Completado</h3>
                  <p className="text-sm mt-2" style={{ color: 'var(--ink-3)' }}>Completa el pago para finalizar.</p>
                </div>

                <Card variant="nested" className="p-5">
                  <p className="text-eyebrow mb-2">Total a pagar</p>
                  <p className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>{activeTrip.finalPrice.toFixed(2)}€</p>
                </Card>

                {activeTrip.paymentMethod === 'cash' ? (
                  <div style={{ background: 'color-mix(in srgb, var(--warn) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--warn) 20%, transparent)', color: 'var(--warn)' }}
                    className="border p-4 rounded-[var(--r-md)] text-sm font-medium">
                    Abona el importe en efectivo al conductor.
                  </div>
                ) : (
                  <Button variant="primary" size="lg" fullWidth onClick={handlePaymentConfirm} loading={isPaying} disabled={isPaying}>
                    <CreditCard className="w-5 h-5" /> {isPaying ? 'Procesando...' : 'Pagar Ahora'}
                  </Button>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {isBootstrapping && (
          <div className="text-center text-sm py-6 flex items-center justify-center gap-2" style={{ color: 'var(--ink-3)' }}>
            <Spinner size={12} /> Restaurando viaje activo...
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav style={{ background: 'var(--panel)', borderTop: '1px solid var(--line)' }}
        className="fixed bottom-0 left-0 right-0 p-4 flex justify-around items-center z-20">
        <button className="flex flex-col items-center gap-1">
          <Car className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-eyebrow" style={{ color: 'var(--accent)' }}>Viaje</span>
        </button>
        <button onClick={() => navigate('/passenger/history')} className="flex flex-col items-center gap-1">
          <History className="w-5 h-5" style={{ color: 'var(--ink-4)' }} />
          <span className="text-eyebrow" style={{ color: 'var(--ink-4)' }}>Historial</span>
        </button>
        <button onClick={() => navigate('/passenger/profile')} className="flex flex-col items-center gap-1">
          <User className="w-5 h-5" style={{ color: 'var(--ink-4)' }} />
          <span className="text-eyebrow" style={{ color: 'var(--ink-4)' }}>Perfil</span>
        </button>
      </nav>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-sm">
            <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)' }}
              className="p-8 space-y-5">
              <div className="text-center space-y-1">
                <h3 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
                  ¿Cancelar el viaje?
                </h3>
                {activeTrip?.status === 'requested' ? (
                  <p className="text-sm" style={{ color: 'var(--ok)' }}>Cancelación gratuita — el conductor aún no ha sido asignado.</p>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--warn)' }}>
                    Puede aplicarse una penalización de {activeTrip?.pricingRule?.cancellationFee ?? 5}€ por cancelación tardía.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" size="lg" className="flex-1" onClick={() => setShowCancelModal(false)}>
                  Volver
                </Button>
                <Button variant="danger" size="lg" className="flex-[2]"
                  loading={isCancelling} disabled={isCancelling}
                  onClick={handleCancelTrip}>
                  Sí, cancelar
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Rating modal */}
      {ratingTripId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-sm"
          >
            <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)' }}
              className="p-8 space-y-6">
              <div className="text-center">
                <p className="text-eyebrow mb-2">Viaje completado</p>
                <h3 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
                  ¿Cómo fue el servicio?
                </h3>
              </div>

              {/* Stars */}
              <div className="flex justify-center gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRatingScore(n)}
                    className="text-3xl transition-transform hover:scale-110 active:scale-95"
                    style={{ filter: n <= ratingScore ? 'none' : 'grayscale(1) opacity(0.3)' }}
                  >
                    ⭐
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" size="lg" className="flex-1"
                  onClick={() => setRatingTripId(null)}>
                  Omitir
                </Button>
                <Button variant="primary" size="lg" className="flex-[2]"
                  disabled={ratingScore === 0 || isSubmittingRating}
                  loading={isSubmittingRating}
                  onClick={handleSubmitRating}>
                  Enviar valoración
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
