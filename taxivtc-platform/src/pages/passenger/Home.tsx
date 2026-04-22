import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { MapPin, Navigation, Search, Clock, CreditCard, Star, LogOut, Car, User, ChevronRight, History, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, useJsApiLoader, Autocomplete, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { fetchJson } from '../../lib/api';

const containerStyle = {
  width: '100%',
  height: '100%',
};

const center = {
  lat: 43.3623,
  lng: -8.4115
};

const libraries: "places"[] = ["places"];

export default function PassengerHome() {
  const { user, token, logout } = useAuthStore();
  const [step, setStep] = useState<'idle' | 'quoting' | 'searching' | 'on-trip' | 'payment'>('idle');
  const [origin, setOrigin] = useState({ text: 'Calle Real, 12, A Coruña', coords: { lat: 43.369, lng: -8.406 } });
  const [destination, setDestination] = useState<{ text: string, coords: { lat: number, lng: number } | null }>({ text: '', coords: null });
  const [quote, setQuote] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'in_app' | 'cash'>('in_app');
  const [directions, setDirections] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number, heading: number } | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
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
    setDirections(null); // Reset directions on new quote
    try {
      const data = await fetchJson<any>('/api/passenger/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ originText: origin.text, destinationText: destination.text }),
      });
      setQuote(data);

      // Get directions for the map using the server-validated coordinates
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: data.origin.coords,
          destination: data.destination.coords,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
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
    // The `quote` object now contains the server-validated data
    const { origin, destination, estimatedPrice, distanceMeters, durationSeconds, pricingRuleId, breakdown } = quote;
    try {
      const data = await fetchJson<any>('/api/passenger/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          origin,
          destination,
          agreedPrice: estimatedPrice,
          distanceMeters,
          durationSeconds,
          pricingRuleId,
          breakdown,
          paymentMethod
        }),
      });
      setActiveTrip(data);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'No se pudo solicitar el viaje');
      setStep('quoting');
    } finally {
      setIsRequestingTrip(false);
    }
  };

  const handlePaymentConfirm = async () => {
    setUiError(null);
    setIsPaying(true);
    try {
      const data = await fetchJson<any>(`/api/passenger/trips/${activeTrip.id}/payment/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setActiveTrip(data);
      if (data.paymentStatus === 'paid') {
        setStep('idle');
        setDestination({ text: '', coords: null });
        setQuote(null);
        setActiveTrip(null);
      }
    } catch (error) {
      setUiError(error instanceof Error ? error.message : 'No se pudo completar el pago');
    } finally {
      setIsPaying(false);
    }
  };

  useEffect(() => {
    const fetchActiveTrip = async () => {
      setIsBootstrapping(true);
      try {
        const data = await fetchJson<any | null>('/api/passenger/trips/active', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (data) {
          setActiveTrip(data);
          if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'no_show') {
            if (data.paymentStatus !== 'paid') {
              setStep('payment');
            }
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

    eventSource.addEventListener('trip_update', async (e) => {
      // Fetch full trip details to get nested relations (driver, user)
      try {
        const data = await fetchJson<any>(`/api/passenger/trips/${activeTrip.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setActiveTrip(data);
      
        if (data.status === 'completed') {
          if (data.paymentStatus === 'paid') {
            setStep('idle');
            setDestination({ text: '', coords: null });
            setQuote(null);
            setActiveTrip(null);
          } else {
            setStep('payment');
          }
        } else if (data.status === 'cancelled' || data.status === 'no_show') {
          if (data.paymentStatus === 'paid') {
            setStep('idle');
            setDestination({ text: '', coords: null });
            setQuote(null);
            setActiveTrip(null);
          } else {
            setStep('payment');
          }
        } else if (['driver_en_route', 'arrived_at_pickup', 'passenger_on_board', 'in_progress'].includes(data.status)) {
          setStep('on-trip');
        }
      } catch {
        setUiError('No se pudo refrescar el estado del viaje');
      }
    });

    return () => {
      eventSource.close();
    };
  }, [activeTrip?.id, token]);
  
  useEffect(() => {
    if (step !== 'on-trip' || !activeTrip?.driver?.id) return;

    const eventSource = new EventSource('/api/events/drivers');

    eventSource.addEventListener('driver_location_update', (e) => {
      const location = JSON.parse(e.data);
      setDriverLocation(location);
    });

    return () => {
      eventSource.close();
    };
  }, [step, activeTrip?.driver?.id, token]);


  return (
    <div className="min-h-screen bg-zinc-50 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-zinc-100 p-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center shadow-lg">
            <Car className="text-white w-6 h-6" />
          </div>
          <div>
            <span className="font-black text-xl tracking-tighter uppercase italic">TaxiVTC</span>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">A Coruña</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <History className="w-5 h-5 text-zinc-500" />
          </button>
          <button onClick={logout} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <LogOut className="w-5 h-5 text-zinc-500" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full space-y-6 pb-24">
        {uiError && (
          <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 text-sm font-medium">
            {uiError}
          </div>
        )}

        {/* Map View */}
        <div className="h-64 bg-zinc-200 rounded-[2.5rem] overflow-hidden relative shadow-inner border-4 border-white">
          {!isLoaded ? (
            <div className="h-full w-full flex items-center justify-center text-zinc-500 text-sm font-medium bg-zinc-100">
              Cargando mapa...
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={driverLocation || center}
              zoom={15}
              options={{ disableDefaultUI: true, gestureHandling: 'none' }}
            >
              {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />}
              {driverLocation && (
                <Marker
                  position={driverLocation}
                  icon={{
                    path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 7,
                    rotation: driverLocation.heading,
                    fillColor: "#000",
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: "#FFF",
                  }}
                />
              )}
            </GoogleMap>
          )}
        </div>

        {/* Input Section */}
        <AnimatePresence mode="wait">
          {step === 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-zinc-100 space-y-6"
            >
              <div className="space-y-4">
                {isLoaded && (
                  <>
                    <div className="flex items-center gap-4 group">
                      <div className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center border border-zinc-100 group-focus-within:border-zinc-900 transition-colors">
                        <MapPin className="text-zinc-400 w-5 h-5 group-focus-within:text-zinc-900" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Recogida</p>
                        <Autocomplete
                          onLoad={(ref) => (originAutocompleteRef.current = ref)}
                          onPlaceChanged={() => {
                            if (originAutocompleteRef.current) {
                              const place = originAutocompleteRef.current.getPlace();
                              setOrigin({
                                text: place.formatted_address,
                                coords: {
                                  lat: place.geometry.location.lat(),
                                  lng: place.geometry.location.lng(),
                                },
                              });
                            }
                          }}
                        >
                          <input
                            type="text"
                            value={origin.text}
                            onChange={(e) => setOrigin({ ...origin, text: e.target.value })}
                            className="w-full bg-transparent font-bold text-zinc-900 outline-none placeholder:text-zinc-300"
                            placeholder="¿Dónde te recogemos?"
                          />
                        </Autocomplete>
                      </div>
                    </div>
                    
                    <div className="h-px bg-zinc-100 ml-14"></div>

                    <div className="flex items-center gap-4 group">
                      <div className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center border border-zinc-100 group-focus-within:border-zinc-900 transition-colors">
                        <Search className="text-zinc-400 w-5 h-5 group-focus-within:text-zinc-900" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Destino</p>
                        <Autocomplete
                          onLoad={(ref) => (destinationAutocompleteRef.current = ref)}
                          onPlaceChanged={() => {
                            if (destinationAutocompleteRef.current) {
                              const place = destinationAutocompleteRef.current.getPlace();
                              setDestination({
                                text: place.formatted_address,
                                coords: {
                                  lat: place.geometry.location.lat(),
                                  lng: place.geometry.location.lng(),
                                },
                              });
                            }
                          }}
                        >
                          <input
                            type="text"
                            value={destination.text}
                            onChange={(e) => setDestination({ ...destination, text: e.target.value })}
                            className="w-full bg-transparent font-bold text-zinc-900 outline-none placeholder:text-zinc-300"
                            placeholder="¿A dónde vas?"
                          />
                        </Autocomplete>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={handleQuote}
                disabled={!destination.coords || isSubmittingQuote}
                className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-zinc-800 disabled:opacity-30 transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-3"
              >
                {isSubmittingQuote ? 'Calculando...' : 'Solicitar Presupuesto'} <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === 'quoting' && quote && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-zinc-100 space-y-8"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-3xl font-black text-zinc-900 tracking-tighter italic uppercase">Precio Cerrado</h3>
                  <p className="text-zinc-500 font-medium">Acuerdo electrónico de servicio</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black text-zinc-900">{quote.estimatedPrice.toFixed(2)}€</p>
                  <div className="flex items-center justify-end gap-1 text-green-600">
                    <ShieldCheck className="w-3 h-3" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Garantizado</p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-50 rounded-3xl p-6 space-y-4 border border-zinc-100">
                <div className="flex justify-between text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  <span>Distancia Estimada</span>
                  <span className="text-zinc-900">{(quote.distanceMeters / 1000).toFixed(1)} km</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  <span>Tiempo Estimado</span>
                  <span className="text-zinc-900">~{Math.round(quote.durationSeconds / 60)} min</span>
                </div>
                <div className="h-px bg-zinc-200"></div>
                <div className="flex justify-between text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  <span>Tarifa {quote.city}</span>
                  <span className="text-zinc-900">Aplicada</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-zinc-50 rounded-3xl border border-zinc-100 flex flex-col items-center gap-2">
                  <Clock className="w-6 h-6 text-zinc-400" />
                  <span className="text-sm font-black text-zinc-900">Recogida Inmediata</span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Disponibilidad</span>
                </div>
                <button
                  onClick={() => setPaymentMethod(prev => prev === 'in_app' ? 'cash' : 'in_app')}
                  className="p-5 bg-zinc-50 rounded-3xl border border-zinc-100 flex flex-col items-center gap-2 hover:bg-zinc-100 transition-colors"
                >
                  <CreditCard className={`w-6 h-6 ${paymentMethod === 'in_app' ? 'text-zinc-900' : 'text-zinc-400'}`} />
                  <span className="text-sm font-black text-zinc-900">{paymentMethod === 'in_app' ? 'Pago App' : 'Efectivo'}</span>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Método (Cambiar)</span>
                </button>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep('idle')}
                  className="flex-1 bg-zinc-100 text-zinc-900 py-5 rounded-2xl font-black hover:bg-zinc-200 transition-all"
                >
                  Atrás
                </button>
                <button
                  onClick={handleRequest}
                  disabled={isRequestingTrip}
                  className="flex-[2] bg-zinc-900 text-white py-5 rounded-2xl font-black text-xl hover:bg-zinc-800 transition-all shadow-xl disabled:opacity-50"
                >
                  {isRequestingTrip ? 'Solicitando...' : 'Pedir Ahora'}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'searching' && (
            <div className="bg-white rounded-[2.5rem] shadow-2xl p-12 flex flex-col items-center space-y-8">
              <div className="relative">
                {activeTrip?.dispatchStatus === 'no_driver_found' ? (
                  <div className="w-32 h-32 border-8 border-red-100 rounded-full flex items-center justify-center">
                    <Car className="w-12 h-12 text-red-500" />
                  </div>
                ) : (
                  <>
                    <div className="w-32 h-32 border-8 border-zinc-100 border-t-zinc-900 rounded-full animate-spin"></div>
                    <Car className="absolute inset-0 m-auto w-12 h-12 text-zinc-900" />
                  </>
                )}
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-black text-zinc-900 uppercase italic tracking-tighter">
                  {activeTrip?.dispatchStatus === 'no_driver_found' ? 'Sin conductores' : 'Buscando Taxi'}
                </h3>
                <p className="text-zinc-500 font-medium mt-2">
                  {activeTrip?.dispatchStatus === 'no_driver_found' 
                    ? 'No hay conductores disponibles en este momento. Por favor, inténtalo de nuevo en unos minutos.'
                    : 'Estamos asignando el vehículo más cercano a tu posición en A Coruña.'}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (activeTrip?.id) {
                    try {
                      await fetchJson(`/api/passenger/trips/${activeTrip.id}/cancel`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                      });
                    } catch (error) {
                      setUiError(error instanceof Error ? error.message : 'No se pudo cancelar el viaje');
                      return;
                    }
                  }
                  setStep('idle');
                  setActiveTrip(null);
                }}
                className={
                  activeTrip?.dispatchStatus === 'no_driver_found'
                    ? "w-full bg-zinc-900 text-white py-4 rounded-xl font-bold mt-4"
                    : "text-zinc-400 font-black text-sm uppercase tracking-widest hover:text-zinc-900 transition-colors"
                }
              >
                {activeTrip?.dispatchStatus === 'no_driver_found' ? 'Volver al inicio' : 'Cancelar'}
              </button>
            </div>
          )}

          {step === 'on-trip' && activeTrip && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-zinc-100 space-y-8"
            >
              <div className="flex justify-between items-center bg-zinc-900 text-white p-6 rounded-[2rem] shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-700">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">Conductor</p>
                    <p className="font-black text-xl tracking-tight">{activeTrip.driver?.user?.name || 'En camino'}</p>
                    <div className="flex items-center gap-1 text-yellow-400 mt-1">
                      <Star className="w-3 h-3 fill-current" />
                      <span className="text-xs font-bold">4.9</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                   <div className="bg-white text-zinc-900 px-3 py-1 rounded-lg font-black text-sm mb-1">
                     {activeTrip.driver?.licenseNumber || 'LIC-1234'}
                   </div>
                   <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">Matrícula</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-2 h-2 bg-zinc-900 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Recogida</p>
                    <p className="font-bold text-zinc-900 text-sm truncate">{activeTrip.originText}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-2 h-2 border-2 border-zinc-900 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Destino</p>
                    <p className="font-bold text-zinc-900 text-sm truncate">{activeTrip.destinationText}</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-100 flex justify-between items-center">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-black text-zinc-900 uppercase tracking-widest">
                      {activeTrip.status === 'driver_en_route' ? 'Conductor en camino' : 
                       activeTrip.status === 'arrived_at_pickup' ? 'Taxi en el punto' : 
                       activeTrip.status === 'passenger_on_board' ? 'Pasajero a bordo' : 
                       activeTrip.status === 'in_progress' ? 'Viaje en curso' : activeTrip.status}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Ref: {activeTrip.bookingReference}</span>
                </div>
                <p className="text-3xl font-black text-zinc-900 tracking-tighter">{activeTrip.agreedPrice.toFixed(2)}€</p>
              </div>
            </motion.div>
          )}
          {step === 'payment' && activeTrip && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-zinc-100 space-y-8 text-center"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-3xl font-black text-zinc-900 tracking-tighter italic uppercase">Viaje Completado</h3>
                <p className="text-zinc-500 font-medium mt-2">Por favor, completa el pago para finalizar.</p>
              </div>
              
              <div className="bg-zinc-50 rounded-3xl p-6 border border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Total a Pagar</p>
                <p className="text-5xl font-black text-zinc-900 tracking-tighter">{activeTrip.finalPrice.toFixed(2)}€</p>
              </div>

              {activeTrip.paymentMethod === 'cash' ? (
                <div className="bg-yellow-50 text-yellow-800 p-6 rounded-2xl font-bold">
                  Por favor, abona el importe en efectivo al conductor.
                </div>
              ) : (
                <button
                  onClick={handlePaymentConfirm}
                  disabled={isPaying}
                  className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-black text-xl hover:bg-zinc-800 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <CreditCard className="w-6 h-6" /> {isPaying ? 'Procesando...' : 'Pagar Ahora'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isBootstrapping && (
          <div className="text-center text-zinc-400 text-sm font-medium py-6">
            Restaurando viaje activo...
          </div>
        )}
      </main>

      {/* Bottom Nav Placeholder */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 p-4 flex justify-around items-center z-20">
        <button className="flex flex-col items-center gap-1 text-zinc-900">
          <Car className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-widest">Viaje</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-zinc-300">
          <History className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-widest">Historial</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-zinc-300">
          <User className="w-6 h-6" />
          <span className="text-[10px] font-black uppercase tracking-widest">Perfil</span>
        </button>
      </nav>
    </div>
  );
}
