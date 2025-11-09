require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Admin';

  if (!email || !password) {
    console.error('Usage: node scripts/create-user.js <email> <password> [name]');
    console.error('Example: node scripts/create-user.js admin@example.com mypassword "Admin User"');
    process.exit(1);
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    console.error(`Error: User with email ${email} already exists`);
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
}

main()
  .catch((error) => {
    console.error('Error creating user:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
