import express from "express";
import { PrismaClient } from "@prisma/client";
import { tripEventEmitter } from "../sse";
import { publicUserSelect } from "../lib/publicUser";
import {
  adminCorrectPaymentSchema,
  adminNotesSchema,
  adminVerifyDriverSchema,
  createLicenseSchema,
  createPricingRuleSchema,
  formatValidationError,
} from "../lib/validation";
import { ZodError } from "zod";

const router = express.Router();
const prisma = new PrismaClient();

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== "admin" && req.user.role !== "operator") return res.status(403).json({ error: "Forbidden" });
  next();
};

router.get("/trips", isAdmin, async (req, res) => {
  const trips = await prisma.trip.findMany({
    include: { 
      passenger: { include: { user: { select: publicUserSelect } } }, 
      driver: { include: { user: { select: publicUserSelect } } } 
    },
    orderBy: { requestedAt: 'desc' }
  });
  res.json(trips);
});

router.get("/drivers", isAdmin, async (req, res) => {
  const drivers = await prisma.driver.findMany({
    include: { user: { select: publicUserSelect }, taxiLicense: true }
  });
  res.json(drivers);
});

router.post("/drivers/:id/verify", isAdmin, async (req, res) => {
  let verificationInput;
  try {
    verificationInput = adminVerifyDriverSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid driver verification payload" });
  }

  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { verificationStatus: verificationInput.status }
  });
  res.json(driver);
});

router.get("/licenses", isAdmin, async (req, res) => {
  const licenses = await prisma.taxiLicense.findMany({
    include: { drivers: { include: { user: { select: publicUserSelect } } } }
  });
  res.json(licenses);
});

router.post("/licenses", isAdmin, async (req, res) => {
  let licenseInput;
  try {
    licenseInput = createLicenseSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid license payload" });
  }

  const license = await prisma.taxiLicense.create({
    data: licenseInput
  });
  res.json(license);
});

router.get("/pricing-rules", isAdmin, async (req, res) => {
  const rules = await prisma.pricingRule.findMany();
  res.json(rules);
});

router.post("/pricing-rules", isAdmin, async (req, res) => {
  let pricingRuleInput;
  try {
    pricingRuleInput = createPricingRuleSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid pricing rule payload" });
  }

  const rule = await prisma.pricingRule.create({
    data: {
      ...pricingRuleInput,
      activeFrom: pricingRuleInput.activeFrom ? new Date(pricingRuleInput.activeFrom) : undefined,
      activeTo: pricingRuleInput.activeTo ? new Date(pricingRuleInput.activeTo) : undefined,
    }
  });
  res.json(rule);
});

router.post("/trips/:id/correct-payment", isAdmin, async (req, res) => {
  let paymentInput;
  try {
    paymentInput = adminCorrectPaymentSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid payment correction payload" });
  }

  const { paymentStatus, finalPrice } = paymentInput;
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
  let notesInput;
  try {
    notesInput = adminNotesSchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: formatValidationError(error) });
    }
    return res.status(400).json({ error: "Invalid notes payload" });
  }

  const { notes } = notesInput;
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
