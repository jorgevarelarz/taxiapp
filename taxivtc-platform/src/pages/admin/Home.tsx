import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { Car, LogOut, Users, ShieldCheck, DollarSign, List, Map } from 'lucide-react';

const containerStyle = {
  width: '100%',
  height: '100%',
};

const center = {
  lat: 43.3623,
  lng: -8.4115
};

const libraries: "places"[] = ["places"];

interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading: number;
}

export default function AdminHome() {
  const { token, logout } = useAuthStore();
  const [liveDrivers, setLiveDrivers] = useState<Record<string, DriverLocation>>({});
  const [view, setView] = useState('map'); // map, trips, drivers, licenses, rules
  
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [rules, setRules] = useState([]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY!,
    libraries,
  });

  useEffect(() => {
    const eventSource = new EventSource(`/api/events/drivers?token=${token}&role=admin`);

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
    const fetchData = async (endpoint: string, setter: Function) => {
      const res = await fetch(`/api/admin/${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setter(data);
    };

    fetchData('trips', setTrips);
    fetchData('drivers', setDrivers);
    fetchData('licenses', setLicenses);
    fetchData('pricing-rules', setRules);
  }, [token, view]);


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
        {view === 'map' && isLoaded && (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={13}
            options={{ disableDefaultUI: true, mapId: 'b19f4a8d3f54d4de' }}
          >
            {Object.values(liveDrivers).map((driver: DriverLocation) => (
              <Marker
                key={driver.driverId}
                position={{ lat: driver.lat, lng: driver.lng }}
                icon={{
                  path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 6,
                  rotation: driver.heading,
                  fillColor: "#000",
                  fillOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: "#FFF",
                }}
              />
            ))}
          </GoogleMap>
        )}
        
        <div className={`p-8 ${view === 'map' ? 'hidden' : 'block'}`}>
          <h1 className="text-3xl font-black capitalize tracking-tighter">{view}</h1>
          <div className="mt-4 bg-white p-4 rounded-xl border border-zinc-100">
            <pre className="text-xs max-h-96 overflow-auto">
              {view === 'trips' && JSON.stringify(trips, null, 2)}
              {view === 'drivers' && JSON.stringify(drivers, null, 2)}
              {view === 'licenses' && JSON.stringify(licenses, null, 2)}
              {view === 'rules' && JSON.stringify(rules, null, 2)}
            </pre>
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
