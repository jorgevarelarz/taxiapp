import express from "express";
import { PrismaClient } from "@prisma/client";
import { driverLocationEventEmitter, tripEventEmitter } from "../sse";
import { customAlphabet } from "nanoid";
import { publicUserSelect } from "../lib/publicUser";
import {
  driverLocationSchema,
  driverOfferSchema,
  driverStatusSchema,
  driverTripStatusSchema,
  formatValidationError,
} from "../lib/validation";
import { ZodError } from "zod";

const router = express.Router();
const prisma = new PrismaClient();

const generateReceiptReference = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

const isDriver = (req: any, res: any, next: any) => {
  if (req.user.role !== "driver") return res.status(403).json({ error: "Forbidden" });
  next();
};

// In-memory store for throttling location updates
const driverLastUpdate: Record<string, number> = {};
const LOCATION_UPDATE_THROTTLE_MS = 5000; // 5 seconds

router.post("/location", isDriver, async (req: any, res) => {
  const driverId = req.user.id;

  // Throttle updates
  const now = Date.now();
  if (driverLastUpdate[driverId] && (now - driverLastUpdate[driverId]) < LOCATION_UPDATE_THROTTLE_MS) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }

  let locationInput;
  try {
    locationInput = driverLocationSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid driver location payload" });
  }

  const { lat, lng, heading } = locationInput;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }
  
  if (user.driver.status === 'offline') {
    return res.status(403).json({ error: "Driver is offline and cannot update location." });
  }
  if (user.driver.verificationStatus !== "verified") {
    return res.status(403).json({ error: "Driver is not verified" });
  }

  const updatedDriver = await prisma.driver.update({
    where: { id: user.driver.id },
    data: {
      lat,
      lng,
      heading: heading ?? null,
      locationUpdatedAt: new Date(),
    },
  });

  driverLastUpdate[driverId] = now;

  driverLocationEventEmitter.emit("driver_location_update", {
    driverId: updatedDriver.id,
    lat: updatedDriver.lat,
    lng: updatedDriver.lng,
    heading: updatedDriver.heading,
    status: updatedDriver.status,
  });

  res.json({ success: true });
});

router.post("/status", isDriver, async (req: any, res) => {
  let statusInput;
  try {
    statusInput = driverStatusSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid driver status payload" });
  }

  const { status } = statusInput;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }
  if ((status === "online" || status === "busy") && user.driver.verificationStatus !== "verified") {
    return res.status(403).json({ error: "Driver must be verified before going available" });
  }

  const updatedDriver = await prisma.driver.update({
    where: { id: user.driver.id },
    data: { status },
  });
  res.json(updatedDriver);
});

router.get("/trips/active", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }

  const activeTrip = await prisma.trip.findFirst({
    where: {
      driverId: user.driver.id,
      status: {
        notIn: ['completed', 'cancelled', 'no_show']
      }
    },
    include: { 
      passenger: { include: { user: { select: publicUserSelect } } }, 
      driver: { include: { user: { select: publicUserSelect } } },
      events: true
    },
    orderBy: { requestedAt: 'desc' }
  });

  // Also check for trips that are completed/cancelled but payment is not paid
  if (!activeTrip) {
    const pendingPaymentTrip = await prisma.trip.findFirst({
      where: {
        driverId: user.driver.id,
        status: {
          in: ['completed', 'cancelled', 'no_show']
        },
        paymentStatus: {
          not: 'paid'
        }
      },
      include: { 
        passenger: { include: { user: { select: publicUserSelect } } }, 
        driver: { include: { user: { select: publicUserSelect } } },
        events: true
      },
      orderBy: { requestedAt: 'desc' }
    });
    return res.json(pendingPaymentTrip || null);
  }

  res.json(activeTrip);
});

router.get("/trips/:id", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }

  const trip = await prisma.trip.findFirst({
    where: {
      id: req.params.id,
      driverId: user.driver.id,
    },
    include: {
      passenger: { include: { user: { select: publicUserSelect } } },
      driver: { include: { user: { select: publicUserSelect } } },
      events: true,
    },
  });

  if (!trip) return res.status(404).json({ error: "Trip not found" });
  res.json(trip);
});

router.get("/requests", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }
  if (user.driver.verificationStatus !== "verified") {
    return res.status(403).json({ error: "Driver is not verified" });
  }

  // Find active offers for this driver
  const activeOffers = await prisma.tripOffer.findMany({
    where: { 
      driverId: user.driver.id,
      status: "pending",
      expiresAt: { gt: new Date() }
    },
    include: { 
      trip: {
        include: { passenger: { include: { user: { select: publicUserSelect } } } }
      }
    }
  });

  // Return the trips associated with these offers
  const trips = activeOffers.map(offer => ({
    ...offer.trip,
    offerId: offer.id,
    expiresAt: offer.expiresAt
  }));

  res.json(trips);
});

router.post("/trips/:id/accept", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }
  if (user.driver.verificationStatus !== "verified") {
    return res.status(403).json({ error: "Driver is not verified" });
  }
  if (user.driver.status !== "online") {
    return res.status(403).json({ error: "Driver must be online to accept trips" });
  }

  let offerInput;
  try {
    offerInput = driverOfferSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid offer payload" });
  }

  const { offerId } = offerInput;
  const now = new Date();

  let trip;
  try {
    trip = await prisma.$transaction(async (tx) => {
      const offer = await tx.tripOffer.findFirst({
        where: {
          id: offerId,
          tripId: req.params.id,
          driverId: user.driver.id,
        },
      });

      if (!offer || offer.status !== "pending" || offer.expiresAt < now) {
        throw new Error("Offer expired or invalid");
      }

      const tripUpdate = await tx.trip.updateMany({
        where: {
          id: req.params.id,
          driverId: null,
          status: "requested",
        },
        data: {
          driverId: user.driver.id,
          status: "driver_en_route",
          dispatchStatus: "accepted",
          driverEnRouteAt: now,
        },
      });

      if (tripUpdate.count !== 1) {
        throw new Error("Trip already accepted");
      }

      await tx.tripOffer.update({
        where: { id: offerId },
        data: { status: "accepted", respondedAt: now },
      });

      await tx.tripOffer.updateMany({
        where: {
          tripId: req.params.id,
          id: { not: offerId },
          status: "pending",
        },
        data: { status: "expired", respondedAt: now },
      });

      const acceptedTrip = await tx.trip.findUnique({
        where: { id: req.params.id },
        include: { passenger: { include: { user: { select: publicUserSelect } } } },
      });

      if (!acceptedTrip) {
        throw new Error("Trip not found");
      }

      await tx.tripEvent.create({
        data: {
          tripId: acceptedTrip.id,
          type: "TRIP_ACCEPTED",
          payloadJson: JSON.stringify({ driverId: user.driver.id }),
        },
      });

      return acceptedTrip;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not accept trip";
    const status = message === "Offer expired or invalid" || message === "Trip already accepted" ? 409 : 400;
    return res.status(status).json({ error: message });
  }

  tripEventEmitter.emit('trip_update', trip);

  res.json(trip);
});

router.post("/trips/:id/reject", isDriver, async (req: any, res) => {
  let offerInput;
  try {
    offerInput = driverOfferSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid offer payload" });
  }

  const { offerId } = offerInput;
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }
  if (user.driver.verificationStatus !== "verified") {
    return res.status(403).json({ error: "Driver is not verified" });
  }

  const offer = await prisma.tripOffer.findFirst({
    where: {
      id: offerId,
      tripId: req.params.id,
      driverId: user.driver.id,
    },
  });
  if (!offer || offer.status !== "pending") {
    return res.status(400).json({ error: "Offer expired or invalid" });
  }
  
  await prisma.tripOffer.update({
    where: { id: offerId },
    data: { status: "rejected", respondedAt: new Date() }
  });

  await prisma.tripEvent.create({
    data: { tripId: req.params.id, type: "DISPATCH_REJECTED", payloadJson: JSON.stringify({ offerId }) }
  });

  tripEventEmitter.emit('trip_update', { id: req.params.id });

  // Trigger dispatch again to find next driver
  const { dispatchTrip } = await import("../services/dispatch");
  await dispatchTrip(req.params.id);

  res.json({ success: true });
});

router.post("/trips/:id/status", isDriver, async (req: any, res) => {
  let statusInput;
  try {
    statusInput = driverTripStatusSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid trip status payload" });
  }

  const { status } = statusInput;

  const trip = await prisma.trip.findUnique({ 
    where: { id: req.params.id },
    include: { pricingRule: true }
  });
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }
  if (trip.driverId !== user.driver.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  if (trip.status === 'cancelled') {
    return res.status(400).json({ error: "Cannot update a cancelled trip" });
  }

  // State machine validation
  const validTransitions: Record<string, string[]> = {
    'driver_en_route': ['arrived_at_pickup'],
    'arrived_at_pickup': ['passenger_on_board', 'no_show'],
    'passenger_on_board': ['in_progress'],
    'in_progress': ['completed'],
  };

  if (!validTransitions[trip.status]?.includes(status)) {
    return res.status(400).json({ error: `Invalid transition from ${trip.status} to ${status}` });
  }

  const updateData: any = { status };
  
  if (status === 'arrived_at_pickup') {
    updateData.arrivedAtPickupAt = new Date();
  } else if (status === 'passenger_on_board') {
    updateData.passengerOnBoardAt = new Date();
  } else if (status === 'in_progress') {
    updateData.startedAt = new Date();
  } else if (status === 'completed') {
    updateData.finalPrice = trip.agreedPrice;
    updateData.completedAt = new Date();
    updateData.paymentStatus = trip.paymentMethod === 'in_app' ? 'processing' : 'pending';
  } else if (status === 'no_show') {
    if (trip.status !== 'arrived_at_pickup') {
      return res.status(400).json({ error: "Can only mark no_show after arriving at pickup" });
    }
    const noShowFee = trip.pricingRule?.noShowFee ?? 5.0; // Use fee from rule or default
    updateData.noShowAt = new Date();
    updateData.finalPrice = noShowFee;
    updateData.paymentStatus = trip.paymentMethod === 'in_app' ? 'processing' : 'pending';
  }

  const updatedTrip = await prisma.trip.update({
    where: { id: req.params.id },
    data: updateData,
    include: { passenger: { include: { user: { select: publicUserSelect } } } }
  });

  await prisma.tripEvent.create({
    data: { tripId: updatedTrip.id, type: `TRIP_${status.toUpperCase()}` }
  });

  tripEventEmitter.emit('trip_update', updatedTrip);

  res.json(updatedTrip);
});

router.post("/trips/:id/payment/collect", isDriver, async (req: any, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }
  if (trip.driverId !== user.driver.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  if (!['completed', 'no_show', 'cancelled'].includes(trip.status)) {
    return res.status(400).json({ error: "Trip must be completed, no_show, or cancelled to collect payment" });
  }

  if (trip.paymentMethod !== 'cash') {
    return res.status(400).json({ error: "Payment method is not cash" });
  }

  // Idempotency check
  if (trip.paymentStatus === 'paid') {
    return res.json(trip);
  }

  const updatedTrip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { 
      paymentStatus: "paid",
      paidAt: new Date(),
      receiptReference: `RCPT-${generateReceiptReference()}`
    },
    include: { passenger: { include: { user: { select: publicUserSelect } } } }
  });

  await prisma.tripEvent.create({
    data: { tripId: updatedTrip.id, type: "PAYMENT_COLLECTED", payloadJson: JSON.stringify({ method: 'cash', amount: updatedTrip.finalPrice }) }
  });

  tripEventEmitter.emit('trip_update', updatedTrip);

  res.json(updatedTrip);
});

router.post("/trips/:id/cancel", isDriver, async (req: any, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  if (!user.isActive) {
    return res.status(403).json({ error: "Account is inactive" });
  }

  if (trip.driverId !== user.driver.id) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const nonCancellableStatuses = ['passenger_on_board', 'in_progress', 'completed', 'cancelled', 'no_show'];
  if (nonCancellableStatuses.includes(trip.status)) {
    return res.status(400).json({ error: `Cannot cancel a trip in ${trip.status} status` });
  }

  const updatedTrip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { 
      status: "cancelled", 
      cancelledAt: new Date(),
      finalPrice: 0,
      paymentStatus: 'paid'
    }
  });

  await prisma.tripEvent.create({
    data: { tripId: req.params.id, type: "DRIVER_CANCELLED" }
  });

  tripEventEmitter.emit('trip_update', updatedTrip);

  res.json(updatedTrip);
});

router.get("/history", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });
  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });

  const trips = await prisma.trip.findMany({
    where: {
      driverId: user.driver.id,
      status: { in: ["completed", "no_show", "cancelled"] },
    },
    include: {
      passenger: { include: { user: { select: publicUserSelect } } },
    },
    orderBy: { requestedAt: "desc" },
    take: 50,
  });
  res.json(trips);
});

router.get("/profile", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      driver: {
        include: {
          taxiLicense: { include: { vehicles: true } },
        },
      },
    },
  });
  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    licenseNumber: user.driver.licenseNumber,
    status: user.driver.status,
    verificationStatus: user.driver.verificationStatus,
    taxiLicense: user.driver.taxiLicense,
    vehicle: user.driver.taxiLicense?.vehicles?.[0] ?? null,
  });
});

router.get("/earnings", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });
  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayTrips, weekTrips, monthTrips, allTimeTrips] = await Promise.all([
    prisma.trip.findMany({
      where: { driverId: user.driver.id, status: "completed", completedAt: { gte: todayStart } },
      select: { finalPrice: true, completedAt: true },
    }),
    prisma.trip.findMany({
      where: { driverId: user.driver.id, status: "completed", completedAt: { gte: weekStart } },
      select: { finalPrice: true },
    }),
    prisma.trip.findMany({
      where: { driverId: user.driver.id, status: "completed", completedAt: { gte: monthStart } },
      select: { finalPrice: true },
    }),
    prisma.trip.findMany({
      where: { driverId: user.driver.id, status: "completed" },
      select: { finalPrice: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 30,
    }),
  ]);

  const sum = (trips: { finalPrice: number | null }[]) =>
    trips.reduce((acc, t) => acc + (t.finalPrice ?? 0), 0);

  // Yesterday for comparison
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayTrips = allTimeTrips.filter(
    (t) => t.completedAt && t.completedAt >= yesterdayStart && t.completedAt < todayStart
  );
  const todayTotal = sum(todayTrips);
  const yesterdayTotal = sum(yesterdayTrips);
  const pctVsYesterday =
    yesterdayTotal > 0 ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : null;

  res.json({
    today: { total: todayTotal, trips: todayTrips.length },
    week: { total: sum(weekTrips), trips: weekTrips.length },
    month: { total: sum(monthTrips), trips: monthTrips.length },
    pctVsYesterday,
  });
});

export default router;
