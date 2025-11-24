// Prisma v7 config for Docker environment
// This file provides a simple config without TypeScript dependencies

module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'file:/app/data/wanwatch.db',
  },
};
