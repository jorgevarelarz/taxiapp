import { PrismaClient } from "@prisma/client";
import { tripEventEmitter } from "../sse";

const prisma = new PrismaClient();

export async function dispatchTrip(tripId: string) {
  // Expire any old pending offers for this trip
  await prisma.tripOffer.updateMany({
    where: {
      tripId: tripId,
      status: "pending",
      expiresAt: { lt: new Date() }
    },
    data: { status: "expired" }
  });

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { offers: true }
  });

  if (!trip || trip.status !== "requested") return;

  // Find drivers who are online and haven't rejected or let an offer expire for this trip
  const previouslyOfferedDriverIds = trip.offers.map(o => o.driverId);

  const availableDriver = await prisma.driver.findFirst({
    where: {
      status: "online",
      verificationStatus: "verified",
      id: { notIn: previouslyOfferedDriverIds }
    }
  });

  if (!availableDriver) {
    // No drivers found
    const updatedTrip = await prisma.trip.update({
      where: { id: tripId },
      data: { dispatchStatus: "no_driver_found" }
    });
    await prisma.tripEvent.create({
      data: { tripId, type: "DISPATCH_NO_DRIVER_FOUND" }
    });
    tripEventEmitter.emit('trip_update', updatedTrip);
    return;
  }

  // Create offer
  const expiresAt = new Date(Date.now() + 15 * 1000); // 15 seconds to accept
  
  const offer = await prisma.tripOffer.create({
    data: {
      tripId,
      driverId: availableDriver.id,
      expiresAt
    }
  });

  const newStatus = trip.dispatchStatus === "pending_dispatch" ? "offered" : "reassigned";

  const updatedTrip = await prisma.trip.update({
    where: { id: tripId },
    data: { dispatchStatus: newStatus }
  });

  await prisma.tripEvent.create({
    data: { 
      tripId, 
      type: newStatus === "offered" ? "DISPATCH_OFFERED" : "DISPATCH_REASSIGNED",
      payloadJson: JSON.stringify({ driverId: availableDriver.id })
    }
  });

  tripEventEmitter.emit('trip_update', updatedTrip);
  tripEventEmitter.emit('new_trip', updatedTrip); // Notify drivers of new offer
}
