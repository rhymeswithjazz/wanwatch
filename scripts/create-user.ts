import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Admin';

  if (!email || !password) {
    console.error('Usage: npm run create-user <email> <password> [name]');
    console.error('Example: npm run create-user admin@example.com mypassword "Admin User"');
    process.exit(1);
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    console.error(`Error: User with email ${email} already exists`);
    await logger.warn('Attempted to create duplicate user', {
      email,
      existingUserId: existingUser.id
    });
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name
    }
  });

  console.log('✅ User created successfully:');
  console.log(`   Email: ${user.email}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   ID: ${user.id}`);

  await logger.info('User created via CLI script', {
    userId: user.id,
    email: user.email,
    name: user.name,
    source: 'create-user-script'
  });
}

main()
  .catch(async (error) => {
    console.error('Error creating user:', error);
    await logger.error('Failed to create user via CLI script', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
