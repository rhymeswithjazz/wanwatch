/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs', '@prisma/adapter-better-sqlite3', 'better-sqlite3'],
  // Turbopack handles client-side module resolution automatically
  turbopack: {},
}

module.exports = nextConfig
