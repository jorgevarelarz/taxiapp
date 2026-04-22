import React from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%',
};

const center = {
  lat: 43.3623,
  lng: -8.4115,
};

const libraries: "places"[] = ["places"];

interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading: number;
}

export default function LiveMap({ liveDrivers }: { liveDrivers: Record<string, DriverLocation> }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script-admin',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY!,
    libraries,
  });

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-100 text-zinc-500 text-sm font-medium">
        Cargando mapa operativo...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={13}
      options={{ disableDefaultUI: true, mapId: 'b19f4a8d3f54d4de' }}
    >
      {Object.values(liveDrivers).map((driver) => (
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
  );
}
