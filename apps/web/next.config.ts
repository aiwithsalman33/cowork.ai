import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  transpilePackages: ['@cowork/shared'],
  poweredByHeader: false,
  // Small servers (1 vCPU): type-checking runs in CI / `npm run typecheck`, not inside the
  // production build, and the build uses a single worker to keep memory low.
  typescript: { ignoreBuildErrors: process.env.LOW_MEMORY_BUILD === '1' },
  experimental: { cpus: 1, workerThreads: false },
  async rewrites() {
    // Browser → web origin → api. Keeps auth cookies first-party (same origin).
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
