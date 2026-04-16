import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Security headers — use :path* (not /(.*)) to avoid parens conflicting
  // with route group paths like /_next/static/chunks/app/(auth)/login/...
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // Prevent CDN caching of HTML to avoid stale chunk references after deploy
      // Use has: missing _next/static matcher is not supported, so use path patterns:
      {
        source: '/login',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/dashboard/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
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
