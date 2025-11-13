import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const monthsToGenerate = parseInt(process.argv[2] || '3');
  const checkIntervalSeconds = parseInt(process.argv[3] || '300'); // Default 5 minutes

  console.log(`Generating ${monthsToGenerate} months of data with ${checkIntervalSeconds}s intervals...`);

  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(now.getMonth() - monthsToGenerate);

  // Generate connection checks
  const checks = [];
  const outages = [];

  let currentDate = new Date(startDate);
  let isInOutage = false;
  let outageStart: Date | null = null;
  let checksInOutage = 0;

  while (currentDate <= now) {
    // Randomly decide if we should start/end an outage
    // 0.5% chance to toggle outage state
    const shouldToggleOutage = Math.random() < 0.005;

    if (shouldToggleOutage && !isInOutage) {
      // Start an outage
      isInOutage = true;
      outageStart = new Date(currentDate);
      checksInOutage = 0;
    } else if (shouldToggleOutage && isInOutage && outageStart) {
      // End the outage
      const durationSec = Math.floor((currentDate.getTime() - outageStart.getTime()) / 1000);
      outages.push({
        startTime: new Date(outageStart),
        endTime: new Date(currentDate),
        durationSec,
        isResolved: true,
        checksCount: checksInOutage,
        emailSent: true
      });
      isInOutage = false;
      outageStart = null;
    }

    // Create connection check
    const isConnected = !isInOutage;
    const targets = ['8.8.8.8', '1.1.1.1', 'google.com'];
    const randomTarget = targets[Math.floor(Math.random() * targets.length)] || '8.8.8.8';

    checks.push({
      timestamp: new Date(currentDate),
      isConnected,
      latencyMs: isConnected ? Math.floor(Math.random() * 50) + 10 : null,
      target: isConnected ? randomTarget : 'all-targets-failed'
    });

    if (isInOutage) {
      checksInOutage++;
    }

    // Advance time
    currentDate = new Date(currentDate.getTime() + checkIntervalSeconds * 1000);
  }

  console.log(`Generated ${checks.length} connection checks`);
  console.log(`Generated ${outages.length} outages`);

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.connectionCheck.deleteMany({});
  await prisma.outage.deleteMany({
    where: { isResolved: true }
  });

  // Insert in batches to avoid overwhelming the database
  const batchSize = 1000;
  console.log('Inserting connection checks...');

  for (let i = 0; i < checks.length; i += batchSize) {
    const batch = checks.slice(i, i + batchSize);
    await prisma.connectionCheck.createMany({
      data: batch
    });
    console.log(`Inserted ${Math.min(i + batchSize, checks.length)}/${checks.length} checks`);
  }

  console.log('Inserting outages...');
  for (const outage of outages) {
    await prisma.outage.create({
      data: outage
    });
  }

  console.log('✅ Database seeded successfully!');
  console.log(`   Time range: ${startDate.toLocaleString()} to ${now.toLocaleString()}`);
  console.log(`   Total checks: ${checks.length}`);
  console.log(`   Total outages: ${outages.length}`);
  console.log(`   Average uptime: ${((checks.filter(c => c.isConnected).length / checks.length) * 100).toFixed(2)}%`);
}

main()
  .catch((error) => {
    console.error('Error seeding database:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
