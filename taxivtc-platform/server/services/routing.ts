import { Client, LatLng, TravelMode } from "@googlemaps/google-maps-services-js";

// --- SECURITY WARNING ---
// The Google Maps API key is managed via the .env file (GOOGLE_MAPS_API_KEY).
// The previously used key was exposed and should be considered compromised.
// Ensure you have replaced it with a new, restricted key in your .env file.
// --------------------------

// IMPORTANT: This is an abstraction for a routing provider.
// The OSRM implementation below is now commented out in favor of Google Maps.
// For a real application, you should self-host OSRM or use a paid service like Google Maps or Mapbox.

export interface RoutingProvider {
  getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<{ distanceMeters: number; durationSeconds: number }>;
}

/*
class OsrmRoutingProvider implements RoutingProvider {
  // Using the public OSRM demo server. Not for production use.
  private osrmBaseUrl = "http://router.project-osrm.org";

  async getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<{ distanceMeters: number; durationSeconds: number }> {
    const profile = "driving";
    const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `${this.osrmBaseUrl}/route/v1/${profile}/${coordinates}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`OSRM API request failed with status ${response.status}`);
      }
      const data = await response.json();

      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        throw new Error("OSRM could not find a route");
      }

      const route = data.routes[0];
      return {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
      };
    } catch (error: any) {
      console.error("Error fetching route from OSRM:", error);
      throw new Error("Could not calculate route.", { cause: error });
    }
  }
}
*/

class GoogleMapsRoutingProvider implements RoutingProvider {
  private client = new Client({});

  async getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<{ distanceMeters: number; durationSeconds: number }> {
    try {
      const response = await this.client.directions({
        params: {
          origin,
          destination,
          key: process.env.GOOGLE_MAPS_API_KEY!,
          mode: TravelMode.driving,
        },
      });

      if (response.data.status !== "OK" || response.data.routes.length === 0) {
        throw new Error(
          `Google Maps could not find a route. Status: ${response.data.status}`
        );
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      if (!leg.distance || !leg.duration) {
        throw new Error("Google Maps did not return distance or duration.");
      }

      return {
        distanceMeters: leg.distance.value,
        durationSeconds: leg.duration.value,
      };
    } catch (error: any) {
      console.error("Error fetching route from Google Maps:", error);
      // Check for Axios error structure
      if (error.response) {
        console.error("Google Maps API Error:", error.response.data);
        throw new Error(`Google Maps API Error: ${error.response.data.error_message || error.response.statusText}`);
      }
      throw new Error("Could not calculate route.", { cause: error });
    }
  }
}

// Export a single instance of the provider
export const routingProvider: RoutingProvider = new GoogleMapsRoutingProvider();
