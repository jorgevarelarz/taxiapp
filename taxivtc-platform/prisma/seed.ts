import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding pricing rules...');

  // A Coruña Taxi Pricing (Approximate official rates)
  await prisma.pricingRule.upsert({
    where: { id: 'coruna-taxi-standard' },
    update: {},
    create: {
      id: 'coruna-taxi-standard',
      city: 'A Coruña',
      baseFare: 4.15,
      minimumFare: 5.00,
      perKmDay: 1.12,
      perKmNight: 1.45,
      waitingPerHour: 22.50,
      airportSupplement: 3.60,
      stationSupplement: 1.20,
    },
  });

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
