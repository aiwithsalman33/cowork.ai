import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
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
  WA_SESSIONS_DIR: z.string().default('./data/wa-sessions'),
  WA_GRAPH_VERSION: z.string().default('v21.0'),

  COMPOSIO_API_KEY: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_GMAIL: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_GOOGLESHEETS: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_GOOGLEDRIVE: z.string().optional(),
  COMPOSIO_AUTH_CONFIG_GOOGLEDOCS: z.string().optional(),

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
  const parsed = envSchema.safeParse(process.env);
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
