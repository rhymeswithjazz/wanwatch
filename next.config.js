/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'speedtest-net'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude optional dependencies from bundling that speedtest-net may reference
      config.externals = [...(config.externals || []), 'electron', 'aws-sdk'];
    }
    return config;
  },
}

module.exports = nextConfig
