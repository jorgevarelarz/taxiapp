export interface User {
  id: string;
  email: string;
  name: string;
  role: 'passenger' | 'driver' | 'operator' | 'admin';
  passenger?: { id: string };
  driver?: { id: string; status: string };
}

export interface Quote {
  origin: { text: string; coords: { lat: number; lng: number } };
  destination: { text: string; coords: { lat: number; lng: number } };
  estimatedPrice: number;
  distanceMeters: number;
  durationSeconds: number;
  pricingRuleId: string;
  city: string;
  breakdown: {
    base: number;
    distance: number;
    time: number;
    minimum?: number;
  };
}

export type TripStatus =
  | 'requested'
  | 'driver_en_route'
  | 'arrived_at_pickup'
  | 'passenger_on_board'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type PaymentMethod = 'in_app' | 'cash';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed';
export type DispatchStatus = 'dispatching' | 'driver_assigned' | 'no_driver_found';

export interface Trip {
  id: string;
  bookingReference: string;
  status: TripStatus;
  dispatchStatus?: DispatchStatus;

  originText: string;
  originLat: number;
  originLng: number;
  destinationText: string;
  destinationLat: number;
  destinationLng: number;

  agreedPrice: number;
  finalPrice?: number;
  estimatedPrice?: number;
  distanceMeters: number;
  durationSeconds: number;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;

  passenger?: {
    id: string;
    user: { id: string; name: string; phone?: string };
  };
  driver?: {
    id: string;
    licenseNumber: string;
    user: { id: string; name: string; phone?: string };
  };

  createdAt: string;
  updatedAt: string;
}

export interface TripRequest {
  id: string;
  offerId: string;
  bookingReference: string;
  passenger: { user: { name: string } };

  originText: string;
  originLat: number;
  originLng: number;
  destinationText: string;
  destinationLat: number;
  destinationLng: number;

  agreedPrice?: number;
  estimatedPrice: number;
  routeDistanceMeters?: number;
  routeDurationSeconds?: number;

  expiresAt: string;
}

export interface Driver {
  id: string;
  licenseNumber: string;
  status: 'online' | 'offline' | 'busy';
  verificationStatus: 'pending' | 'verified' | 'rejected';
  user: { id: string; name: string; email: string; phone: string };
  currentLat?: number;
  currentLng?: number;
}

export interface License {
  id: string;
  licenseCode: string;
  municipality: string;
  ownerName: string;
  isActive: boolean;
  drivers?: Driver[];
}

export interface PricingRule {
  id: string;
  city: string;
  baseFare: number;
  minimumFare: number;
  perKmDay: number;
  perKmNight: number;
  perMinute?: number;
  nightStartHour?: number;
  nightEndHour?: number;
}

export interface TripUpdateEvent {
  type: 'trip_update';
  data: Partial<Trip>;
}

export interface NewTripEvent {
  type: 'new_trip';
  data: { tripId: string };
}

export interface DriverLocationEvent {
  type: 'driver_location_update';
  data: {
    driverId: string;
    lat: number;
    lng: number;
    heading: number;
  };
}
