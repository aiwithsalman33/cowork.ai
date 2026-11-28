import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/**
 * Content-Security-Policy (M13). Cashfree checkout needs its SDK, API and payment pages.
 * Dev mode also needs 'unsafe-eval' for hot reload. Error reports may go to the Sentry host in
 * NEXT_PUBLIC_SENTRY_DSN (build-time).
 */
const sentryHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SENTRY_DSN ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).host : '';
  } catch {
    return '';
  }
})();
const sentry = sentryHost ? ` https://${sentryHost}` : '';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"} https://sdk.cashfree.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.cashfree.com${sentry}`,
  'frame-src https://*.cashfree.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.cashfree.com",
].join('; ');

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
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
