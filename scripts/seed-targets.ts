#!/usr/bin/env tsx

import 'dotenv/config';
import { PrismaClient } from '../prisma/generated/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./wanwatch.db';
  let dbPath = dbUrl.replace(/^file:/, '');
  if (dbPath.startsWith('./')) {
    dbPath = path.join(process.cwd(), 'prisma', dbPath.substring(2));
  }
  return dbPath;
}

const adapter = new PrismaBetterSqlite3({ url: getDatabasePath() });
const prisma = new PrismaClient({ adapter });

const defaultTargets = [
  // DNS Servers (highest priority)
  { target: '8.8.8.8', displayName: 'Google DNS', type: 'dns', priority: 1 },
  { target: '1.1.1.1', displayName: 'Cloudflare DNS', type: 'dns', priority: 2 },

  // Major domains (medium priority)
  { target: 'google.com', displayName: 'Google', type: 'domain', priority: 10 },
  { target: 'espn.com', displayName: 'ESPN', type: 'domain', priority: 11 },
  { target: 'yahoo.com', displayName: 'Yahoo', type: 'domain', priority: 12 },
  { target: 'bing.com', displayName: 'Bing', type: 'domain', priority: 13 },
  { target: 'duckduckgo.com', displayName: 'DuckDuckGo', type: 'domain', priority: 14 },
  { target: 'reddit.com', displayName: 'Reddit', type: 'domain', priority: 15 },
  { target: 'twitter.com', displayName: 'Twitter/X', type: 'domain', priority: 16 },
  { target: 'facebook.com', displayName: 'Facebook', type: 'domain', priority: 17 },
  { target: 'instagram.com', displayName: 'Instagram', type: 'domain', priority: 18 },
  { target: 'youtube.com', displayName: 'YouTube', type: 'domain', priority: 19 },
  { target: 'twitch.tv', displayName: 'Twitch', type: 'domain', priority: 20 },
  { target: 'discord.com', displayName: 'Discord', type: 'domain', priority: 21 },
  { target: 'telegram.org', displayName: 'Telegram', type: 'domain', priority: 22 },
];

async function main() {
  console.log('🌱 Seeding monitoring targets...');

  // Check if targets already exist
  const existingCount = await prisma.monitoringTarget.count();

  if (existingCount > 0) {
    console.log(`⚠️  Found ${existingCount} existing targets. Skipping seed.`);
    console.log('   To re-seed, delete existing targets first or modify this script.');
    return;
  }

  // Insert all default targets
  for (const targetData of defaultTargets) {
    await prisma.monitoringTarget.create({
      data: targetData,
    });
    console.log(`✓ Added: ${targetData.displayName} (${targetData.target})`);
  }

  console.log(`\n✅ Successfully seeded ${defaultTargets.length} monitoring targets!`);
}

main()
  .catch((error) => {
    console.error('❌ Error seeding targets:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
