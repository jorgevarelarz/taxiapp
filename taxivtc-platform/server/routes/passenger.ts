import express from "express";
import { PrismaClient } from "@prisma/client";
import { dispatchTrip } from "../services/dispatch";
import { tripEventEmitter } from "../sse";
import { customAlphabet, nanoid } from "nanoid";

const router = express.Router();
const prisma = new PrismaClient();

const generateBookingReference = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);
const generateReceiptReference = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

import { calculateQuote } from "../services/quote";

// Middleware to ensure passenger role
const isPassenger = (req: any, res: any, next: any) => {
  if (req.user.role !== "passenger") return res.status(403).json({ error: "Forbidden" });
  next();
};

router.post("/quote", isPassenger, async (req, res) => {
  try {
    const { originText, destinationText } = req.body;
    if (!originText || !destinationText) {
      return res.status(400).json({ error: "Origin and destination are required." });
    }
    const quote = await calculateQuote({ originText, destinationText });
    res.json(quote);
  } catch (error: any) {
    res.status(400).json({ error: "Could not calculate quote", details: error.message });
  }
});

router.get("/trips/active", isPassenger, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { passenger: true },
  });

  if (!user?.passenger) return res.status(400).json({ error: "Passenger profile missing" });

  const activeTrip = await prisma.trip.findFirst({
    where: {
      passengerId: user.passenger.id,
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
        passengerId: user.passenger.id,
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

router.post("/trips", isPassenger, async (req: any, res) => {
  const { 
    origin, // Now { text, coords }
    destination, // Now { text, coords }
    agreedPrice, 
    distanceMeters, 
    durationSeconds,
    pricingRuleId,
    breakdown,
    paymentMethod = 'in_app'
  } = req.body;
  
  // Basic validation
  if (!origin?.coords || !destination?.coords) {
    return res.status(400).json({ error: "Invalid origin or destination data." });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { passenger: true },
  });

  if (!user?.passenger) return res.status(400).json({ error: "Passenger profile missing" });

  // Generate a booking reference (TX-XXXXXX)
  const bookingReference = `TX-${generateBookingReference()}`;

  const trip = await prisma.trip.create({
    data: {
      bookingReference,
      passengerId: user.passenger.id,
      originLat: origin.coords.lat,
      originLng: origin.coords.lng,
      originText: origin.text,
      destinationLat: destination.coords.lat,
      destinationLng: destination.coords.lng,
      destinationText: destination.text,
      estimatedPrice: agreedPrice,
      agreedPrice: agreedPrice,
      routeDistanceMeters: distanceMeters,
      routeDurationSeconds: durationSeconds,
      status: "requested",
      quoteAcceptedAt: new Date(),
      pricingRuleId,
      quoteBreakdown: breakdown,
      paymentMethod,
    },
  });

  // Log event
  await prisma.tripEvent.create({
    data: {
      tripId: trip.id,
      type: "TRIP_REQUESTED",
      payloadJson: JSON.stringify({ 
        requestedAt: new Date(),
        bookingReference,
        agreedPrice,
        pricingRuleId,
        breakdown
      })
    }
  });

  res.json(trip);

  // Trigger dispatch asynchronously
  dispatchTrip(trip.id).catch(console.error);

  tripEventEmitter.emit('new_trip', trip);
  tripEventEmitter.emit('trip_update', trip);
});

router.get("/trips/:id", isPassenger, async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id },
    include: { 
      passenger: { include: { user: true } }, 
      driver: { include: { user: true } },
      events: true
    },
  });
  res.json(trip);
});

router.post("/trips/:id/cancel", isPassenger, async (req: any, res) => {
  const trip = await prisma.trip.findUnique({ 
    where: { id: req.params.id },
    include: { pricingRule: true }
  });
  
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  const nonCancellableStatuses = ['passenger_on_board', 'in_progress', 'completed', 'cancelled', 'no_show'];
  if (nonCancellableStatuses.includes(trip.status)) {
    return res.status(400).json({ error: `Cannot cancel a trip in ${trip.status} status` });
  }

  // Cancel any active offers
  await prisma.tripOffer.updateMany({
    where: { tripId: req.params.id, status: "pending" },
    data: { status: "expired" }
  });

  const isBeforeAssignment = trip.status === 'requested';
  const cancellationFee = isBeforeAssignment ? 0 : (trip.pricingRule?.cancellationFee ?? 5.0);

  const updatedTrip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { 
      status: "cancelled", 
      dispatchStatus: "cancelled", 
      cancelledAt: new Date(),
      finalPrice: cancellationFee > 0 ? cancellationFee : 0,
      paymentStatus: cancellationFee > 0 
        ? (trip.paymentMethod === 'in_app' ? 'processing' : 'pending') 
        : 'paid'
    }
  });

  await prisma.tripEvent.create({
    data: { 
      tripId: req.params.id, 
      type: "PASSENGER_CANCELLED",
      payloadJson: JSON.stringify({ isBeforeAssignment, cancellationFee })
    }
  });

  tripEventEmitter.emit('trip_update', updatedTrip);

  res.json(updatedTrip);
});

router.post("/trips/:id/payment/confirm", isPassenger, async (req: any, res) => {
  const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
  if (!trip) return res.status(404).json({ error: "Trip not found" });

  if (!['completed', 'no_show', 'cancelled'].includes(trip.status)) {
    return res.status(400).json({ error: "Trip must be completed, no_show, or cancelled to process payment" });
  }

  if (trip.paymentMethod !== 'in_app') {
    return res.status(400).json({ error: "Payment method is not in_app" });
  }

  // Idempotency check
  if (trip.paymentStatus === 'paid') {
    return res.json(trip);
  }

  // Mock Stripe payment confirmation
  const updatedTrip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { 
      paymentStatus: "paid",
      paidAt: new Date(),
      paymentIntentId: `pi_${nanoid()}`,
      receiptReference: `RCPT-${generateReceiptReference()}`
    },
    include: { driver: { include: { user: true } } }
  });

  await prisma.tripEvent.create({
    data: { tripId: updatedTrip.id, type: "PAYMENT_CONFIRMED", payloadJson: JSON.stringify({ method: 'in_app', amount: updatedTrip.finalPrice, paymentIntentId: updatedTrip.paymentIntentId }) }
  });

  tripEventEmitter.emit('trip_update', updatedTrip);

  res.json(updatedTrip);
});

router.get("/history", isPassenger, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { passenger: true },
  });
  
  const trips = await prisma.trip.findMany({
    where: { passengerId: user?.passenger?.id },
    orderBy: { requestedAt: 'desc' },
    include: { driver: { include: { user: true } } }
  });
  res.json(trips);
});

export default router;
