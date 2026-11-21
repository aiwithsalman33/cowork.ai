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

export const integrationSettingsSchema = z.object({
  sheetId: z.string().trim().max(200).optional(),
  calendarId: z.string().trim().max(200).optional(),
});

// ---------- Billing ----------
export const checkoutSchema = z.object({ plan: z.enum(['STARTER', 'GROWTH']) });

// ---------- Admin ----------
export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
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
