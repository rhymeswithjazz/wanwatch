// Initialize database and create initial admin user if needed
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function init() {
  try {
    // Run migrations first
    console.log('Running database migrations...');
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

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

    await prisma.$disconnect();
  } catch (error) {
    console.error('Initialization error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

init();
