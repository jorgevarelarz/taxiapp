import express from "express";
import { PrismaClient } from "@prisma/client";
import { driverLocationEventEmitter, tripEventEmitter } from "../sse";
import { customAlphabet } from "nanoid";

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

  const { lat, lng, heading } = req.body;

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: "lat and lng are required" });
  }
  
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  if (heading !== undefined && (heading < 0 || heading > 360)) {
    return res.status(400).json({ error: "Invalid heading. Must be between 0 and 360." });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });
  
  if (user.driver.status === 'offline') {
    return res.status(403).json({ error: "Driver is offline and cannot update location." });
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
  const { status } = req.body;
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });

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

  const activeTrip = await prisma.trip.findFirst({
    where: {
      driverId: user.driver.id,
      status: {
        notIn: ['completed', 'cancelled', 'no_show']
      }
    },
    include: { 
      passenger: { include: { user: true } }, 
      driver: { include: { user: true } },
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
        passenger: { include: { user: true } }, 
        driver: { include: { user: true } },
        events: true
      },
      orderBy: { requestedAt: 'desc' }
    });
    return res.json(pendingPaymentTrip || null);
  }

  res.json(activeTrip);
});

router.get("/requests", isDriver, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { driver: true },
  });

  if (!user?.driver) return res.status(400).json({ error: "Driver profile missing" });

  // Find active offers for this driver
  const activeOffers = await prisma.tripOffer.findMany({
    where: { 
      driverId: user.driver.id,
      status: "pending",
      expiresAt: { gt: new Date() }
    },
    include: { 
      trip: {
        include: { passenger: { include: { user: true } } }
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

  const { offerId } = req.body;

  // Verify offer is still valid
  const offer = await prisma.tripOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "pending" || offer.expiresAt < new Date()) {
    return res.status(400).json({ error: "Offer expired or invalid" });
  }

  // Update offer
  await prisma.tripOffer.update({
    where: { id: offerId },
    data: { status: "accepted", respondedAt: new Date() }
  });

  // Update trip
  const trip = await prisma.trip.update({
    where: { id: req.params.id },
    data: {
      driverId: user.driver.id,
      status: "driver_en_route",
      dispatchStatus: "accepted",
      driverEnRouteAt: new Date(),
    },
    include: { passenger: { include: { user: true } } }
  });

  await prisma.tripEvent.create({
    data: { tripId: trip.id, type: "TRIP_ACCEPTED", payloadJson: JSON.stringify({ driverId: user.driver.id }) }
  });

  tripEventEmitter.emit('trip_update', trip);

  res.json(trip);
});

router.post("/trips/:id/reject", isDriver, async (req: any, res) => {
  const { offerId } = req.body;
  
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
  const { status } = req.body;
  const validStatuses = ['driver_en_route', 'arrived_at_pickup', 'passenger_on_board', 'in_progress', 'completed', 'no_show'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const trip = await prisma.trip.findUnique({ 
    where: { id: req.params.id },
    include: { pricingRule: true }
  });
  if (!trip) return res.status(404).json({ error: "Trip not found" });

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
    include: { passenger: { include: { user: true } } }
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
    include: { passenger: { include: { user: true } } }
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

export default router;
