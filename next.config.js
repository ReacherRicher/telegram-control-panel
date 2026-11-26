/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enables instrumentation.ts (used for EMBEDDED_WORKER=true)
    instrumentationHook: true,
    // Keep these server-only libraries out of the webpack bundle
    serverComponentsExternalPackages: ['telegram', 'winston', '@prisma/client'],
  },
};

module.exports = nextConfig;
