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
  /** AI replies one customer can get per hour / per day (stops floods and cost abuse) */
  contactRepliesPerHour: number;
  contactRepliesPerDay: number;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  priceInr: number;
  interval: 'month' | 'trial';
  tagline: string;
  /** trial length (TRIAL) or access granted per payment / admin activation (paid plans) */
  durationDays: number;
  /** highlighted as "Most popular" on the pricing page */
  popular: boolean;
  limits: PlanLimits;
  features: string[];
}

export const TRIAL_DAYS = 7;
export const TRIAL_HOURS = TRIAL_DAYS * 24;

/** Defaults. The live values can be edited by admins (Admin → Plans) and come from the API. */
export const PLANS: Record<PlanId, PlanDef> = {
  TRIAL: {
    id: 'TRIAL',
    name: 'Free Trial',
    priceInr: 0,
    interval: 'trial',
    tagline: '7 days free on Telegram',
    durationDays: 7,
    popular: false,
    limits: {
      channels: 1,
      whatsappSessions: 0,
      messagesPerMonth: 300,
      skills: 10,
      channelTypes: ['TELEGRAM'],
      templates: false,
      contactRepliesPerHour: 20,
      contactRepliesPerDay: 60,
    },
    features: ['Knowledge base & FAQ bot', 'Lead capture & appointments'],
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    priceInr: 499,
    interval: 'month',
    tagline: 'Telegram + WhatsApp for a single business',
    durationDays: 30,
    popular: true,
    limits: {
      channels: 3,
      whatsappSessions: 1,
      messagesPerMonth: 3000,
      skills: 20,
      channelTypes: ['TELEGRAM', 'WHATSAPP_QR'],
      templates: false,
      contactRepliesPerHour: 20,
      contactRepliesPerDay: 60,
    },
    features: ['Google Sheets, Calendar & Gmail', 'Boss Mode (control by WhatsApp)'],
  },
  GROWTH: {
    id: 'GROWTH',
    name: 'Growth',
    priceInr: 999,
    interval: 'month',
    tagline: 'Every feature, including the WhatsApp Business API',
    durationDays: 30,
    popular: false,
    limits: {
      channels: 10,
      whatsappSessions: 3,
      messagesPerMonth: 20000,
      skills: Number.POSITIVE_INFINITY,
      channelTypes: ['TELEGRAM', 'WHATSAPP_QR', 'WHATSAPP_CLOUD'],
      templates: true,
      contactRepliesPerHour: 20,
      contactRepliesPerDay: 60,
    },
    features: ['All features', 'WhatsApp templates (sync from Meta, use in AI bot)', 'Priority support'],
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

/** Plan as sent over JSON: Infinity is not valid JSON, so "unlimited" is null. */
export type PlanJSON = Omit<PlanDef, 'limits'> & {
  limits: Omit<PlanLimits, 'skills' | 'messagesPerMonth' | 'channels'> & {
    skills: number | null;
    messagesPerMonth: number | null;
    channels: number | null;
  };
};

const toJsonNum = (n: number) => (Number.isFinite(n) ? n : null);

export function planToJSON(p: PlanDef): PlanJSON {
  return {
    ...p,
    limits: {
      ...p.limits,
      skills: toJsonNum(p.limits.skills),
      messagesPerMonth: toJsonNum(p.limits.messagesPerMonth),
      channels: toJsonNum(p.limits.channels),
    },
  };
}

export function planFromJSON(p: PlanJSON): PlanDef {
  const inf = (n: number | null) => n ?? Number.POSITIVE_INFINITY;
  return {
    ...p,
    limits: {
      ...p.limits,
      skills: inf(p.limits.skills),
      messagesPerMonth: inf(p.limits.messagesPerMonth),
      channels: inf(p.limits.channels),
    },
  };
}

const CHANNEL_NAMES: Record<string, string> = {
  TELEGRAM: 'Telegram',
  WHATSAPP_QR: 'WhatsApp (QR)',
  WHATSAPP_CLOUD: 'WhatsApp Business API',
};

/** Lines for the pricing card, worked out from the plan's actual limits. */
export function limitLines(p: PlanJSON): string[] {
  const n = (v: number | null, one: string, many: string) =>
    v === null ? `Unlimited ${many}` : `${v.toLocaleString('en-IN')} ${v === 1 ? one : many}`;
  const l = p.limits;
  return [
    `${n(l.messagesPerMonth, 'AI reply', 'AI replies')}${p.interval === 'month' ? ' / month' : ''}`,
    `${n(l.channels, 'channel', 'channels')}: ${l.channelTypes.map((t) => CHANNEL_NAMES[t]).join(', ')}`,
    ...(l.whatsappSessions > 1 ? [`${l.whatsappSessions} WhatsApp QR numbers`] : []),
    n(l.skills, 'skill', 'skills'),
  ];
}
