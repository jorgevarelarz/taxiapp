import express from "express";
import { PrismaClient } from "@prisma/client";
import { tripEventEmitter } from "../sse";

const router = express.Router();
const prisma = new PrismaClient();

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== "admin" && req.user.role !== "operator") return res.status(403).json({ error: "Forbidden" });
  next();
};

router.get("/trips", isAdmin, async (req, res) => {
  const trips = await prisma.trip.findMany({
    include: { 
      passenger: { include: { user: true } }, 
      driver: { include: { user: true } } 
    },
    orderBy: { requestedAt: 'desc' }
  });
  res.json(trips);
});

router.get("/drivers", isAdmin, async (req, res) => {
  const drivers = await prisma.driver.findMany({
    include: { user: true, taxiLicense: true }
  });
  res.json(drivers);
});

router.post("/drivers/:id/verify", isAdmin, async (req, res) => {
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { verificationStatus: req.body.status }
  });
  res.json(driver);
});

router.get("/licenses", isAdmin, async (req, res) => {
  const licenses = await prisma.taxiLicense.findMany({
    include: { drivers: { include: { user: true } } }
  });
  res.json(licenses);
});

router.post("/licenses", isAdmin, async (req, res) => {
  const license = await prisma.taxiLicense.create({
    data: req.body
  });
  res.json(license);
});

router.get("/pricing-rules", isAdmin, async (req, res) => {
  const rules = await prisma.pricingRule.findMany();
  res.json(rules);
});

router.post("/pricing-rules", isAdmin, async (req, res) => {
  const rule = await prisma.pricingRule.create({
    data: req.body
  });
  res.json(rule);
});

router.post("/trips/:id/correct-payment", isAdmin, async (req, res) => {
  const { paymentStatus, finalPrice } = req.body;
  const trip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { paymentStatus, finalPrice }
  });
  await prisma.tripEvent.create({
    data: { tripId: trip.id, type: "ADMIN_PAYMENT_CORRECTED", payloadJson: JSON.stringify({ paymentStatus, finalPrice }) }
  });
  tripEventEmitter.emit('trip_update', trip);
  res.json(trip);
});

router.post("/trips/:id/dispute", isAdmin, async (req, res) => {
  const trip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { disputedAt: new Date() }
  });
  await prisma.tripEvent.create({
    data: { tripId: trip.id, type: "TRIP_DISPUTED" }
  });
  tripEventEmitter.emit('trip_update', trip);
  res.json(trip);
});

router.post("/trips/:id/notes", isAdmin, async (req, res) => {
  const { notes } = req.body;
  const trip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { internalNotes: notes }
  });
  await prisma.tripEvent.create({
    data: { tripId: trip.id, type: "ADMIN_NOTE_ADDED", payloadJson: JSON.stringify({ notes }) }
  });
  tripEventEmitter.emit('trip_update', trip);
  res.json(trip);
});

export default router;
