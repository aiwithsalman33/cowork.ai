export const PLAN_IDS = ['TRIAL', 'STARTER', 'GROWTH'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  channels: number;
  whatsappSessions: number;
  messagesPerMonth: number;
  /** max enabled skills; Infinity = unlimited */
  skills: number;
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

export const TRIAL_HOURS = 24;

export const PLANS: Record<PlanId, PlanDef> = {
  TRIAL: {
    id: 'TRIAL',
    name: 'Free Trial',
    priceInr: 0,
    interval: 'trial',
    tagline: '24 hours to try everything',
    limits: { channels: 2, whatsappSessions: 1, messagesPerMonth: 200, skills: 10 },
    features: ['2 channels', '200 messages', '10 skills', 'All integrations'],
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    priceInr: 999,
    interval: 'month',
    tagline: 'For a single business getting started',
    limits: { channels: 3, whatsappSessions: 1, messagesPerMonth: 5000, skills: 20 },
    features: ['3 channels', '5,000 messages / month', '20 skills', 'Google integrations', 'Boss Mode'],
  },
  GROWTH: {
    id: 'GROWTH',
    name: 'Growth',
    priceInr: 2999,
    interval: 'month',
    tagline: 'For busy teams and multiple numbers',
    limits: { channels: 10, whatsappSessions: 3, messagesPerMonth: 30000, skills: Number.POSITIVE_INFINITY },
    features: [
      '10 channels',
      '3 WhatsApp QR sessions',
      '30,000 messages / month',
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
