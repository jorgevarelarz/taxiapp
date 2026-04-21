// server/services/geocoding.ts
import { Client, LatLng } from "@googlemaps/google-maps-services-js";

// --- SECURITY WARNING ---
// The Google Maps API key is managed via the .env file (GOOGLE_MAPS_API_KEY).
// Ensure you have replaced the compromised key with a new, restricted key.
// --------------------------

export interface ValidatedCoordinates {
  lat: number;
  lng: number;
}

export interface GeocodingResult {
  coordinates: ValidatedCoordinates;
  formattedAddress: string;
}

function isValidCoordinate(lat: number, lng: number): boolean {
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodingResult>;
  reverseGeocode(coords: { lat: number; lng: number }): Promise<GeocodingResult>;
}

class GoogleMapsGeocodingProvider implements GeocodingProvider {
  private client = new Client({});
  private apiKey = process.env.GOOGLE_MAPS_API_KEY!;

  async geocode(address: string): Promise<GeocodingResult> {
    try {
      const response = await this.client.geocode({
        params: {
          address,
          key: this.apiKey,
        },
      });

      if (response.data.status !== "OK" || response.data.results.length === 0) {
        throw new Error(
          `Google Maps could not geocode address. Status: ${response.data.status}`
        );
      }

      const result = response.data.results[0];
      const { lat, lng } = result.geometry.location;

      if (!isValidCoordinate(lat, lng)) {
        throw new Error("Invalid coordinates returned from geocoding service.");
      }

      return {
        coordinates: { lat, lng },
        formattedAddress: result.formatted_address,
      };
    } catch (error: any) {
      console.error("Error geocoding address with Google Maps:", error);
       if (error.response) {
        console.error("Google Maps API Error:", error.response.data);
        throw new Error(`Google Maps API Error: ${error.response.data.error_message || error.response.statusText}`);
      }
      throw new Error("Could not geocode address.", { cause: error });
    }
  }

  async reverseGeocode(coords: { lat: number; lng: number }): Promise<GeocodingResult> {
    if (!isValidCoordinate(coords.lat, coords.lng)) {
      throw new Error("Invalid coordinates provided for reverse geocoding.");
    }
    try {
      const response = await this.client.reverseGeocode({
        params: {
          latlng: coords,
          key: this.apiKey,
        },
      });

      if (response.data.status !== "OK" || response.data.results.length === 0) {
        throw new Error(
          `Google Maps could not reverse geocode coordinates. Status: ${response.data.status}`
        );
      }
      
      const result = response.data.results[0];

      return {
        coordinates: coords,
        formattedAddress: result.formatted_address,
      };
    } catch (error: any) {
      console.error("Error reverse geocoding with Google Maps:", error);
      if (error.response) {
        console.error("Google Maps API Error:", error.response.data);
        throw new Error(`Google Maps API Error: ${error.response.data.error_message || error.response.statusText}`);
      }
      throw new Error("Could not reverse geocode coordinates.", { cause: error });
    }
  }
}

export const geocodingProvider: GeocodingProvider = new GoogleMapsGeocodingProvider();
