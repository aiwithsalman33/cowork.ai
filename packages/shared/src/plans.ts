export const PLAN_IDS = ['TRIAL', 'STARTER', 'GROWTH'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

import type { ChannelType } from './types.js';

export interface PlanLimits {
  channels: number;
  whatsappSessions: number;
  messagesPerMonth: number;
  /** max enabled skills; Infinity = unlimited */
  skills: number;
  /** channel types this plan may connect */
  channelTypes: ChannelType[];
  /** WhatsApp Business API message templates (create, sync from Meta, use in the AI bot) */
  templates: boolean;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  priceInr: number;
  interval: 'month' | 'trial';
  tagline: string;
  limits: PlanLimits;
  features: string[];
}

export const TRIAL_DAYS = 7;
export const TRIAL_HOURS = TRIAL_DAYS * 24;

export const PLANS: Record<PlanId, PlanDef> = {
  TRIAL: {
    id: 'TRIAL',
    name: 'Free Trial',
    priceInr: 0,
    interval: 'trial',
    tagline: '7 days free on Telegram',
    limits: {
      channels: 1,
      whatsappSessions: 0,
      messagesPerMonth: 300,
      skills: 10,
      channelTypes: ['TELEGRAM'],
      templates: false,
    },
    features: ['7 days free', '1 Telegram bot', '300 AI replies', '10 skills', 'Knowledge base & FAQ bot'],
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    priceInr: 499,
    interval: 'month',
    tagline: 'Telegram + WhatsApp for a single business',
    limits: {
      channels: 3,
      whatsappSessions: 1,
      messagesPerMonth: 3000,
      skills: 20,
      channelTypes: ['TELEGRAM', 'WHATSAPP_QR'],
      templates: false,
    },
    features: [
      '3 channels (Telegram + WhatsApp QR)',
      '3,000 AI replies / month',
      '20 skills',
      'Google integrations',
      'Boss Mode',
    ],
  },
  GROWTH: {
    id: 'GROWTH',
    name: 'Growth',
    priceInr: 999,
    interval: 'month',
    tagline: 'Every feature, including the WhatsApp Business API',
    limits: {
      channels: 10,
      whatsappSessions: 3,
      messagesPerMonth: 20000,
      skills: Number.POSITIVE_INFINITY,
      channelTypes: ['TELEGRAM', 'WHATSAPP_QR', 'WHATSAPP_CLOUD'],
      templates: true,
    },
    features: [
      'All features',
      '10 channels incl. WhatsApp Business API',
      'WhatsApp templates (sync from Meta, use in AI bot)',
      '3 WhatsApp QR sessions',
      '20,000 AI replies / month',
      'Unlimited skills',
      'Priority support',
    ],
  },
};

/** Constants used for the "Your impact" strip. */
export const IMPACT = {
  minutesSavedPerReply: 2,
  hourlyCostInr: 200,
};

export function formatLimit(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('en-IN') : 'Unlimited';
}
