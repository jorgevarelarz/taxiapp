import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const tripEventEmitter = new EventEmitter();
tripEventEmitter.setMaxListeners(1000);

export const driverLocationEventEmitter = new EventEmitter();
driverLocationEventEmitter.setMaxListeners(1000);

export const subscribeToTrips = async (req: any, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userRole = req.user?.role;
  const tripId = req.query.tripId as string | undefined;

  // Validate passenger trip ownership
  let authorizedTripId: string | null = null;
  if (userRole === 'passenger' && tripId) {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { passenger: true },
    });
    if (user?.passenger) {
      const trip = await prisma.trip.findFirst({
        where: { id: tripId, passengerId: user.passenger.id }
      });
      if (trip) authorizedTripId = trip.id;
    }
  }

  const onTripUpdate = (trip: any) => {
    if (userRole === 'passenger' && authorizedTripId && trip.id === authorizedTripId) {
      res.write(`event: trip_update\ndata: ${JSON.stringify(trip)}\n\n`);
    } else if (userRole === 'admin' || userRole === 'driver') {
      res.write(`event: trip_update\ndata: ${JSON.stringify(trip)}\n\n`);
    }
  };

  const onNewTrip = (trip: any) => {
    if (userRole === 'driver' || userRole === 'admin') {
      res.write(`event: new_trip\ndata: ${JSON.stringify(trip)}\n\n`);
    }
  };

  tripEventEmitter.on('trip_update', onTripUpdate);
  tripEventEmitter.on('new_trip', onNewTrip);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`:\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    tripEventEmitter.off('trip_update', onTripUpdate);
    tripEventEmitter.off('new_trip', onNewTrip);
  });
};

export const subscribeToDriverLocations = async (req: any, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userRole = req.user?.role;
  let driverId: string | null = null;
  let passengerId: string | null = null;

  if (userRole === 'passenger') {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { passenger: true },
      });
      if (user?.passenger) {
        passengerId = user.passenger.id;
        const activeTrip = await prisma.trip.findFirst({
          where: {
            passengerId: user.passenger.id,
            status: { notIn: ['completed', 'cancelled', 'no_show'] }
          },
          orderBy: { requestedAt: 'desc' },
        });
        if (activeTrip?.driverId) {
          driverId = activeTrip.driverId;
        }
      }
    } catch (e) {
      console.error("SSE Auth Error:", e);
      return res.end();
    }
  }

  const onTripUpdate = (trip: any) => {
    if (userRole === 'passenger' && passengerId && trip.passengerId === passengerId) {
      if (['completed', 'cancelled', 'no_show'].includes(trip.status)) {
        driverId = null; // Revoke access when trip ends
      } else if (trip.driverId) {
        driverId = trip.driverId; // Update access if driver changes or is assigned
      }
    }
  };

  if (userRole === 'passenger') {
    tripEventEmitter.on('trip_update', onTripUpdate);
  }

  const onDriverLocationUpdate = (location: any) => {
    // Passenger receives updates only for their currently assigned driver
    if (userRole === 'passenger' && driverId && location.driverId === driverId) {
      res.write(`event: driver_location_update\ndata: ${JSON.stringify(location)}\n\n`);
    } 
    // Admin receives updates for all non-offline drivers
    else if ((userRole === 'admin' || userRole === 'operator') && location.status !== 'offline') {
      res.write(`event: driver_location_update\ndata: ${JSON.stringify(location)}\n\n`);
    }
  };

  driverLocationEventEmitter.on('driver_location_update', onDriverLocationUpdate);

  const heartbeat = setInterval(() => res.write(`:\n\n`), 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    driverLocationEventEmitter.off('driver_location_update', onDriverLocationUpdate);
    if (userRole === 'passenger') {
      tripEventEmitter.off('trip_update', onTripUpdate);
    }
  });
};
