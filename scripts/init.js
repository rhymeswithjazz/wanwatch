// Initialize database and create initial admin user if needed
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function init() {
  try {
    // Run migrations first
    console.log('Running database migrations...');
    const { execSync } = require('child_process');
    // Use globally installed prisma CLI (pinned to 6.19.0 in Dockerfile)
    execSync('prisma migrate deploy', { stdio: 'inherit' });

    // Check if we need to create initial admin user
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    const adminName = process.env.INITIAL_ADMIN_NAME || 'Admin';

    if (adminEmail && adminPassword) {
      console.log('Checking for initial admin user...');

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: adminEmail }
      });

      if (existingUser) {
        console.log(`✓ Admin user ${adminEmail} already exists`);
      } else {
        console.log(`Creating initial admin user: ${adminEmail}`);

        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        const user = await prisma.user.create({
          data: {
            email: adminEmail,
            password: hashedPassword,
            name: adminName
          }
        });

        console.log(`✅ Admin user created successfully: ${user.email}`);
      }
    } else {
      console.log('ℹ No INITIAL_ADMIN_EMAIL/PASSWORD set, skipping admin user creation');
    }

    // Seed default monitoring targets if none exist
    console.log('Checking for monitoring targets...');
    const targetCount = await prisma.monitoringTarget.count();

    if (targetCount === 0) {
      console.log('No monitoring targets found. Seeding default targets...');

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

      for (const targetData of defaultTargets) {
        await prisma.monitoringTarget.create({ data: targetData });
        console.log(`  ✓ Added: ${targetData.displayName} (${targetData.target})`);
      }

      console.log(`✅ Seeded ${defaultTargets.length} default monitoring targets`);
    } else {
      console.log(`✓ Found ${targetCount} existing monitoring targets`);
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Initialization error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

init();
