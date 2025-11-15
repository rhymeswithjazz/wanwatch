/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude optional dependencies from bundling that speedtest-net may reference
      // These are optional deps that the package checks for but doesn't require
      config.externals = [...(config.externals || []), 'electron', 'aws-sdk'];

      // Ignore HTML and other non-JS files in node_modules that webpack tries to parse
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      config.module.rules.push({
        test: /\.html$/,
        type: 'asset/resource',
      });

      // Use null-loader for .node files to prevent parsing issues
      config.module.rules.push({
        test: /\.node$/,
        loader: 'null-loader',
      });
    }
    return config;
  },
}

module.exports = nextConfig
