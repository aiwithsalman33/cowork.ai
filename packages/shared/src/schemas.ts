import { z } from 'zod';
import { PLAN_IDS } from './plans.js';
import { PROVIDER_IDS } from './providers.js';

// ---------- Auth ----------
export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'At least 8 characters').max(200),
  businessName: z.string().trim().max(120).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const emailOnlySchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, 'At least 8 characters').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

// ---------- Agent ----------
export const TONES = ['friendly', 'professional', 'casual', 'enthusiastic', 'empathetic', 'concise'] as const;

export const personalitySchema = z.object({
  name: z.string().trim().min(1).max(60),
  businessName: z.string().trim().max(120).default(''),
  tone: z.enum(TONES),
  language: z.string().trim().max(60).default('Auto-detect'),
  greeting: z.string().max(500).default(''),
  instructions: z.string().max(4000).default(''),
  emojis: z.boolean().default(true),
  replyLength: z.enum(['short', 'medium', 'detailed']).default('short'),
  isActive: z.boolean().default(true),
});
export type PersonalityInput = z.infer<typeof personalitySchema>;

export const knowledgeSchema = z.object({
  businessDetails: z.string().max(20000).default(''),
  productsServices: z.string().max(20000).default(''),
  commonQuestions: z.string().max(20000).default(''),
});
export type KnowledgeInput = z.infer<typeof knowledgeSchema>;

export const bossNumbersSchema = z.object({
  bossNumbers: z
    .array(
      z
        .string()
        .trim()
        .regex(/^\+?\d{7,15}$/, 'Use international format, e.g. +919876543210'),
    )
    .max(5),
});

// ---------- API keys ----------
export const apiKeySchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(8).max(400).optional(),
  makeActive: z.boolean().default(true),
});
export type ApiKeyInput = z.infer<typeof apiKeySchema>;

// ---------- Skills ----------
export const SKILL_CATEGORIES = [
  'Customer Support',
  'Sales & Marketing',
  'Scheduling',
  'Communication',
  'Analytics',
  'Industry Specific',
  'Education',
  'Custom',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const TOOL_NAMES = [
  'book_appointment',
  'capture_lead',
  'send_email',
  'search_drive',
  'read_doc',
  'read_sheet',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const skillToggleSchema = z.object({ enabled: z.boolean() });

export const skillUpsertSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(5).max(400),
  category: z.enum(SKILL_CATEGORIES),
  icon: z.string().trim().max(40).default('sparkles'),
  promptFragment: z.string().trim().min(10).max(4000),
  tools: z.array(z.enum(TOOL_NAMES)).default([]),
  isPublic: z.boolean().default(false),
});
export type SkillUpsertInput = z.infer<typeof skillUpsertSchema>;

export const skillGenerateSchema = z.object({
  description: z.string().trim().min(10).max(2000),
});

// ---------- Channels ----------
export const telegramChannelSchema = z.object({
  botToken: z
    .string()
    .trim()
    .regex(/^\d{5,}:[A-Za-z0-9_-]{30,}$/, 'That does not look like a Telegram bot token'),
});

export const whatsappQrChannelSchema = z.object({
  name: z.string().trim().max(60).default('WhatsApp'),
});

export const whatsappCloudChannelSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{6,30}$/),
  businessAccountId: z
    .string()
    .trim()
    .regex(/^\d{6,30}$/)
    .optional(),
  accessToken: z.string().trim().min(20).max(1000),
  appSecret: z.string().trim().min(16).max(200),
  displayPhone: z.string().trim().max(30).optional(),
});

// ---------- Schedules ----------
export const scheduleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  channelId: z.string().min(1),
  recipient: z.string().trim().min(3).max(120),
  message: z.string().trim().min(1).max(4000),
  frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY']),
  runAt: z.coerce.date(),
  enabled: z.boolean().default(true),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;

// ---------- Appointments ----------
export const appointmentUpdateSchema = z.object({
  status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
});

// ---------- Integrations ----------
export const TOOLKITS = ['gmail', 'googlecalendar', 'googlesheets', 'googledrive', 'googledocs'] as const;
export type Toolkit = (typeof TOOLKITS)[number];

export const integrationRequestSchema = z.object({
  toolName: z.string().trim().min(2).max(80),
  useCase: z.string().trim().min(5).max(1000),
});

export const googleCredentialsSchema = z.object({
  clientId: z
    .string()
    .trim()
    .regex(/^[\w-]+\.apps\.googleusercontent\.com$/, 'Client ID should end with .apps.googleusercontent.com'),
  clientSecret: z.string().trim().min(10).max(200),
});

export const googleConnectSchema = z.object({
  services: z.array(z.enum(TOOLKITS)).min(1, 'Pick at least one Google service'),
});

export const googleSettingsSchema = z.object({
  calendarId: z.string().trim().max(200).optional(),
});

export const agentSheetSchema = z.object({
  sheet: z.string().trim().min(10, 'Paste the Google Sheet link').max(500),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).default(''),
  purpose: z.enum(['LEADS', 'LOOKUP']),
  tab: z.string().trim().max(100).optional(),
});
export type AgentSheetInput = z.infer<typeof agentSheetSchema>;

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,20}$/, 'Enter a valid phone number'),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  business: z.string().trim().max(120).optional(),
  message: z.string().trim().min(5).max(2000),
});
export type ContactInput = z.infer<typeof contactSchema>;

// ---------- Billing ----------
export const checkoutSchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH']),
  /** 10-digit Indian mobile number; Cashfree requires a customer phone */
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')),
});

// ---------- Admin ----------
export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export const adminUserUpdateSchema = z.object({
  plan: z.enum(PLAN_IDS).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  extendTrialHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  verifyEmail: z.literal(true).optional(),
  approve: z.literal(true).optional(),
});

export const featureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_.-]+$/),
  description: z.string().trim().max(300).default(''),
  enabled: z.boolean().default(false),
  plans: z.array(z.enum(PLAN_IDS)).default([]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(30),
});

// ---------- Plans (admin) ----------
const limitNum = z.number().int().min(0).max(10_000_000).nullable();
export const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  tagline: z.string().trim().max(120).default(''),
  priceInr: z.number().int().min(0).max(1_000_000),
  durationDays: z.number().int().min(1).max(366),
  popular: z.boolean().default(false),
  features: z.array(z.string().trim().min(1).max(120)).max(15).default([]),
  limits: z.object({
    channels: limitNum,
    whatsappSessions: z.number().int().min(0).max(50),
    messagesPerMonth: limitNum,
    skills: limitNum,
    channelTypes: z.array(z.enum(['TELEGRAM', 'WHATSAPP_QR', 'WHATSAPP_CLOUD'])).min(1),
    templates: z.boolean(),
  }),
});
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

// ---------- Agent documents (Google Docs allow-list) ----------
export const agentDocSchema = z.object({
  /** Google Docs link or document id */
  doc: z.string().trim().min(10).max(500),
});
