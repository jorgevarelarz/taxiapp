import { PrismaClient } from "@prisma/client";
import { routingProvider } from "./routing";
import { geocodingProvider } from "./geocoding";

const prisma = new PrismaClient();

interface QuoteRequest {
  originText: string;
  destinationText: string;
  city?: string;
}

export async function calculateQuote(request: QuoteRequest) {
  const { originText, destinationText, city: cityHint = "A Coruña" } = request;

  // 1. Geocode origin and destination addresses
  const [originResult, destinationResult] = await Promise.all([
    geocodingProvider.geocode(originText),
    geocodingProvider.geocode(destinationText),
  ]);

  const originCoords = originResult.coordinates;
  const destinationCoords = destinationResult.coordinates;
  
  // 2. Get real distance and duration from the routing provider
  const { distanceMeters, durationSeconds } = await routingProvider.getRoute(originCoords, destinationCoords);

  if (distanceMeters === undefined || durationSeconds === undefined) {
    throw new Error("Could not determine route between origin and destination.");
  }

  // 3. Find pricing rules for the city (can be improved with geocoded city)
  const rule = await prisma.pricingRule.findFirst({
    where: { city: cityHint },
  });

  if (!rule) {
    throw new Error(`No pricing rules found for city: ${cityHint}`);
  }

  // 4. Determine if it's night rate (22:00 - 06:00 or weekend)
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 is Sunday, 6 is Saturday
  const isNight = hour >= 22 || hour < 6 || day === 0 || day === 6;
  const ratePerKm = isNight ? rule.perKmNight : rule.perKmDay;

  // 5. Calculate price
  const distanceKm = distanceMeters / 1000;
  const baseFare = rule.baseFare;
  const distanceFare = distanceKm * ratePerKm;
  let estimatedPrice = baseFare + distanceFare;
  const minFareApplied = estimatedPrice < rule.minimumFare;
  estimatedPrice = Math.max(estimatedPrice, rule.minimumFare);

  return {
    // Return validated data to be used in trip creation
    origin: {
      text: originResult.formattedAddress,
      coords: originCoords,
    },
    destination: {
      text: destinationResult.formattedAddress,
      coords: destinationCoords,
    },
    estimatedPrice: parseFloat(estimatedPrice.toFixed(2)),
    distanceMeters,
    durationSeconds,
    city: cityHint,
    currency: "EUR",
    isNightRate: isNight,
    pricingRuleId: rule.id,
    breakdown: {
      baseFare: parseFloat(baseFare.toFixed(2)),
      distanceFare: parseFloat(distanceFare.toFixed(2)),
      timeEstimateSeconds: durationSeconds,
      rateType: isNight ? "night" : "day",
      minFareApplied
    }
  };
}
