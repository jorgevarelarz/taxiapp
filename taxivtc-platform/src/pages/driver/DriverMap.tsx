import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DirectionsRenderer, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%',
};

const libraries: "places"[] = ["places"];

type LatLng = { lat: number; lng: number };

type DriverMapRequest = {
  id: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
};

type DriverMapTrip = {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
};

type RouteSummary = {
  distanceMeters: number | null;
  durationSeconds: number | null;
};

function getLegSummary(result: google.maps.DirectionsResult | null): RouteSummary {
  const leg = result?.routes?.[0]?.legs?.[0];
  return {
    distanceMeters: leg?.distance?.value ?? null,
    durationSeconds: leg?.duration?.value ?? null,
  };
}

function getMapCenter(currentLocation: LatLng | null, activeTrip: DriverMapTrip | null, requests: DriverMapRequest[]) {
  if (currentLocation) return currentLocation;
  if (activeTrip) {
    return { lat: activeTrip.originLat, lng: activeTrip.originLng };
  }
  if (requests[0]) {
    return { lat: requests[0].originLat, lng: requests[0].originLng };
  }
  return { lat: 43.3623, lng: -8.4115 };
}

export default function DriverMap({
  currentLocation,
  activeTrip,
  requests,
  onRouteMetricsChange,
  onRequestMetricsChange,
}: {
  currentLocation: LatLng | null;
  activeTrip: DriverMapTrip | null;
  requests: DriverMapRequest[];
  onRouteMetricsChange?: (metrics: {
    pickup: RouteSummary | null;
    trip: RouteSummary | null;
  }) => void;
  onRequestMetricsChange?: (metrics: Record<string, RouteSummary>) => void;
}) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script-driver',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY!,
    libraries,
  });

  const center = getMapCenter(currentLocation, activeTrip, requests);
  const [pickupDirections, setPickupDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [tripDirections, setTripDirections] = useState<google.maps.DirectionsResult | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const activeTripKey = useMemo(() => {
    if (!activeTrip) return null;
    return [
      activeTrip.originLat,
      activeTrip.originLng,
      activeTrip.destinationLat,
      activeTrip.destinationLng,
      currentLocation?.lat ?? 'na',
      currentLocation?.lng ?? 'na',
    ].join(':');
  }, [activeTrip, currentLocation]);

  useEffect(() => {
    if (!isLoaded || !activeTrip) {
      setPickupDirections(null);
      setTripDirections(null);
      onRouteMetricsChange?.({ pickup: null, trip: null });
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: { lat: activeTrip.originLat, lng: activeTrip.originLng },
        destination: { lat: activeTrip.destinationLat, lng: activeTrip.destinationLng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          setTripDirections(result);
        } else {
          setTripDirections(null);
        }
      }
    );

    if (!currentLocation) {
      setPickupDirections(null);
      onRouteMetricsChange?.({
        pickup: null,
        trip: getLegSummary(tripDirections),
      });
      return;
    }

    directionsService.route(
      {
        origin: currentLocation,
        destination: { lat: activeTrip.originLat, lng: activeTrip.originLng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          setPickupDirections(result);
        } else {
          setPickupDirections(null);
        }
      }
    );
  }, [activeTripKey, activeTrip, currentLocation, isLoaded, onRouteMetricsChange, tripDirections]);

  useEffect(() => {
    onRouteMetricsChange?.({
      pickup: getLegSummary(pickupDirections),
      trip: getLegSummary(tripDirections),
    });
  }, [onRouteMetricsChange, pickupDirections, tripDirections]);

  useEffect(() => {
    if (!isLoaded || !!activeTrip || !currentLocation || requests.length === 0) {
      onRequestMetricsChange?.({});
      return;
    }

    const distanceMatrixService = new window.google.maps.DistanceMatrixService();
    const trackedRequests = requests.slice(0, 6);

    distanceMatrixService.getDistanceMatrix(
      {
        origins: [currentLocation],
        destinations: trackedRequests.map((request) => ({
          lat: request.originLat,
          lng: request.originLng,
        })),
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (response, status) => {
        if (status !== 'OK' || !response?.rows?.[0]?.elements) {
          onRequestMetricsChange?.({});
          return;
        }

        const metrics = trackedRequests.reduce<Record<string, RouteSummary>>((acc, request, index) => {
          const element = response.rows[0]?.elements[index];
          acc[request.id] = {
            distanceMeters: element?.distance?.value ?? null,
            durationSeconds: element?.duration?.value ?? null,
          };
          return acc;
        }, {});

        onRequestMetricsChange?.(metrics);
      }
    );
  }, [activeTrip, currentLocation, isLoaded, onRequestMetricsChange, requests]);

  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoints = false;

    if (currentLocation) {
      bounds.extend(currentLocation);
      hasPoints = true;
    }

    if (activeTrip) {
      bounds.extend({ lat: activeTrip.originLat, lng: activeTrip.originLng });
      bounds.extend({ lat: activeTrip.destinationLat, lng: activeTrip.destinationLng });
      hasPoints = true;
    } else {
      requests.slice(0, 5).forEach((request) => {
        bounds.extend({ lat: request.originLat, lng: request.originLng });
        hasPoints = true;
      });
    }

    if (hasPoints) {
      mapRef.current.fitBounds(bounds, 48);
    }
  }, [activeTrip, currentLocation, isLoaded, requests]);

  if (!isLoaded) return null;

  return (
    <GoogleMap
      onLoad={(map) => {
        mapRef.current = map;
      }}
      mapContainerStyle={containerStyle}
      center={center}
      zoom={13}
      options={{ disableDefaultUI: true, mapId: 'b19f4a8d3f54d4de', gestureHandling: 'greedy' }}
    >
      {currentLocation && (
        <Marker
          position={currentLocation}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#22c55e",
            fillOpacity: 1,
            strokeWeight: 3,
            strokeColor: "#ffffff",
          }}
        />
      )}

      {activeTrip ? (
        <>
          <Marker
            position={{ lat: activeTrip.originLat, lng: activeTrip.originLng }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#111827",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#ffffff",
            }}
          />
          <Marker
            position={{ lat: activeTrip.destinationLat, lng: activeTrip.destinationLng }}
            icon={{
              path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: "#ffffff",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#111827",
            }}
          />
          {tripDirections && (
            <DirectionsRenderer
              directions={tripDirections}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: '#ffffff',
                  strokeOpacity: 0.9,
                  strokeWeight: 4,
                },
              }}
            />
          )}
          {pickupDirections && (
            <DirectionsRenderer
              directions={pickupDirections}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: '#22c55e',
                  strokeOpacity: 0.9,
                  strokeWeight: 3,
                },
              }}
            />
          )}
        </>
      ) : (
        requests.map((request) => (
          <Marker
            key={request.id}
            position={{ lat: request.originLat, lng: request.originLng }}
            icon={{
              path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: "#ffffff",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#111827",
            }}
          />
        ))
      )}
    </GoogleMap>
  );
}
