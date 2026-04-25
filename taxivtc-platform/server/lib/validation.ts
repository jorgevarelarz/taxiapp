import { ZodError, z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);
const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: nonEmptyTrimmedString,
  phone: nonEmptyTrimmedString,
  role: z.enum(["passenger", "driver"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const quoteSchema = z.object({
  originText: nonEmptyTrimmedString,
  destinationText: nonEmptyTrimmedString,
});

export const createTripSchema = z.object({
  origin: z.object({
    text: nonEmptyTrimmedString,
    coords: coordinateSchema,
  }),
  destination: z.object({
    text: nonEmptyTrimmedString,
    coords: coordinateSchema,
  }),
  agreedPrice: z.number().finite().nonnegative(),
  distanceMeters: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  pricingRuleId: z.string().trim().min(1).optional(),
  breakdown: z.record(z.string(), z.unknown()).optional(),
  paymentMethod: z.enum(["in_app", "cash"]).default("in_app"),
});

export const driverLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
});

export const driverStatusSchema = z.object({
  status: z.enum(["online", "offline", "busy"]),
});

export const driverOfferSchema = z.object({
  offerId: z.string().trim().min(1),
});

export const driverTripStatusSchema = z.object({
  status: z.enum([
    "driver_en_route",
    "arrived_at_pickup",
    "passenger_on_board",
    "in_progress",
    "completed",
    "no_show",
  ]),
});

export const adminVerifyDriverSchema = z.object({
  status: z.enum(["pending", "verified", "rejected"]),
});

export const createLicenseSchema = z.object({
  licenseCode: nonEmptyTrimmedString,
  municipality: nonEmptyTrimmedString,
  ownerName: nonEmptyTrimmedString,
  isActive: z.boolean().optional(),
});

export const createPricingRuleSchema = z.object({
  city: nonEmptyTrimmedString,
  baseFare: z.number().finite().nonnegative(),
  minimumFare: z.number().finite().nonnegative(),
  perKmDay: z.number().finite().nonnegative(),
  perKmNight: z.number().finite().nonnegative(),
  waitingPerHour: z.number().finite().nonnegative(),
  airportSupplement: z.number().finite().nonnegative().optional(),
  stationSupplement: z.number().finite().nonnegative().optional(),
  noShowFee: z.number().finite().nonnegative().optional(),
  cancellationFee: z.number().finite().nonnegative().optional(),
  activeFrom: z.string().datetime().optional(),
  activeTo: z.string().datetime().optional(),
});

export const adminCorrectPaymentSchema = z.object({
  paymentStatus: z.enum(["pending", "processing", "paid", "failed"]),
  finalPrice: z.number().finite().nonnegative(),
});

export const adminNotesSchema = z.object({
  notes: z.string().trim().max(2000),
});

export const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export function formatValidationError(error: ZodError) {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request body";
}
