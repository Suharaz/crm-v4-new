import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Proxy API calls to NestJS backend (exclude Next.js API routes like /api/auth)
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
