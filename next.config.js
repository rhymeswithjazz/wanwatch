/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs', '@prisma/adapter-better-sqlite3', 'better-sqlite3'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve 'fs', 'net', etc. on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
