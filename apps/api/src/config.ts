import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  /** login/signup attempts per IP per minute */
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(5),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool.optional(),
  /** 'true' trusts all proxies; a number = how many proxy hops to trust (Traefik + Next = 2). */
  TRUST_PROXY: z
    .string()
    .default('2')
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : ['true', 'yes'].includes(v.toLowerCase()))),

  QUEUE_ENABLED: bool.default(true),
  WORKERS_ENABLED: bool.default(true),
  BAILEYS_ENABLED: bool.default(true),
  /** deterministic fake model instead of real providers (tests, local dev, load tests); never in production */
  LLM_FAKE: bool.default(false),
  /** git sha baked into the image (Dockerfile ARG SENTRY_RELEASE) */
  APP_RELEASE: z.string().default('dev'),
  /** Sentry error tracking for the API; off when empty (read by src/instrument.ts) */
  SENTRY_DSN: z.string().optional(),
  WA_SESSIONS_DIR: z.string().default('./data/wa-sessions'),
  WA_GRAPH_VERSION: z.string().default('v21.0'),

  // Outgoing email (verification + password reset). Gmail: smtp.gmail.com:465 with an App Password.
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: bool.default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  /** without SMTP, print emails to the log instead of failing (local docker only) */
  MAIL_LOG_FALLBACK: bool.default(false),

  // Online payments (Cashfree). Off until the keys are added and BILLING_ENABLED=true.
  BILLING_ENABLED: bool.default(false),
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  CASHFREE_API_VERSION: z.string().default('2025-01-01'),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_STARTER: z.string().optional(),
  RAZORPAY_PLAN_GROWTH: z.string().optional(),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  // accept common alternative names for the mail settings
  const src = { ...process.env };
  src.SMTP_PASS ||= src.SMTP_PASSWORD;
  src.MAIL_FROM ||= src.SMTP_FROM;
  // Gmail app passwords are shown with spaces ("abcd efgh ijkl mnop")
  if (src.SMTP_PASS) src.SMTP_PASS = src.SMTP_PASS.replace(/\s+/g, '');
  const parsed = envSchema.safeParse(src);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const cookieSecure = env.COOKIE_SECURE ?? env.WEB_ORIGIN.startsWith('https://');
