import type { PlanId } from './plans.js';
import type { ProviderId } from './providers.js';
import type { SkillCategory, Toolkit, ToolName } from './schemas.js';

export type Role = 'USER' | 'ADMIN';
export type ChannelType = 'TELEGRAM' | 'WHATSAPP_QR' | 'WHATSAPP_CLOUD';
export type ChannelStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED' | 'ERROR';

export interface MeDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  plan: PlanId;
  status: 'ACTIVE' | 'SUSPENDED';
  trialEndsAt: string | null;
  planActive: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  impersonatedBy: { id: string; email: string } | null;
  createdAt: string;
}

export interface ChannelDTO {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  externalId: string | null;
  lastError: string | null;
  webhookUrl: string | null;
  verifyToken?: string | null;
  createdAt: string;
}

export interface SkillDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  icon: string;
  tools: ToolName[];
  isPublic: boolean;
  isCustom: boolean;
  enabled: boolean;
  promptFragment?: string;
}

export interface ApiKeyDTO {
  provider: ProviderId;
  model: string;
  last4: string;
  isActive: boolean;
  updatedAt: string;
}

export interface IntegrationDTO {
  toolkit: Toolkit;
  status: 'CONNECTED' | 'PENDING' | 'DISCONNECTED' | 'ERROR';
  connectedAt: string | null;
  configured: boolean;
  settings: { sheetId?: string; calendarId?: string };
}

export interface ConversationDTO {
  id: string;
  channelType: ChannelType;
  channelName: string;
  contact: { id: string; name: string | null; externalId: string; phone: string | null };
  lastMessage: string | null;
  lastMessageAt: string;
  messageCount: number;
}

export interface MessageDTO {
  id: string;
  direction: 'IN' | 'OUT';
  role: 'USER' | 'ASSISTANT' | 'OWNER' | 'SYSTEM';
  content: string;
  createdAt: string;
  toolCalls?: { name: string; ok: boolean }[] | null;
}

export interface DashboardDTO {
  impact: {
    messagesHandled: number;
    minutesSaved: number;
    moneySavedInr: number;
    tokensUsed: number;
    availability: string;
  };
  stats: {
    messagesToday: number;
    conversationsToday: number;
    newUsersToday: number;
    replyRate: number;
    totalMessages: number;
    uniqueUsers: number;
    userMessages: number;
    botReplies: number;
  };
  checklist: { customized: boolean; aiKey: boolean; channel: boolean; testMessage: boolean };
  recentConversations: ConversationDTO[];
  activeSkills: { slug: string; name: string; icon: string }[];
  channels: ChannelDTO[];
  agent: {
    name: string;
    isActive: boolean;
    provider: string | null;
    model: string | null;
    planActive: boolean;
  };
  usage: { messagesThisMonth: number; messageLimit: number };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
