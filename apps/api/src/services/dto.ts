import type { Channel, Contact, Conversation } from '@prisma/client';
import type { ChannelDTO, ConversationDTO } from '@cowork/shared';
import { env } from '../config.js';

/** Telegram and Meta only accept HTTPS webhooks; in production upgrade a misconfigured http:// base. */
function publicBase(): string {
  const base = env.PUBLIC_API_URL.replace(/\/+$/, '');
  const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base);
  return env.NODE_ENV === 'production' && !local ? base.replace(/^http:\/\//, 'https://') : base;
}

export function webhookUrlFor(channel: Pick<Channel, 'id' | 'type'>): string | null {
  if (channel.type === 'WHATSAPP_CLOUD') return `${publicBase()}/webhooks/whatsapp/${channel.id}`;
  if (channel.type === 'TELEGRAM') return `${publicBase()}/webhooks/telegram/${channel.id}`;
  return null;
}

export function toChannelDTO(c: Channel): ChannelDTO {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    status: c.status,
    externalId: c.externalId,
    lastError: c.lastError,
    aiEnabled: c.aiEnabled,
    webhookUrl: webhookUrlFor(c),
    // The Cloud API verify token is not a credential (Meta only echoes it back); the owner must paste it in Meta.
    verifyToken: c.type === 'WHATSAPP_CLOUD' ? c.webhookSecret : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toConversationDTO(c: Conversation & { contact: Contact; channel: Channel }): ConversationDTO {
  return {
    id: c.id,
    channelId: c.channelId,
    channelStatus: c.channel.status,
    channelType: c.channel.type,
    channelName: c.channel.name,
    contact: {
      id: c.contact.id,
      name: c.contact.name,
      externalId: c.contact.externalId,
      phone: c.contact.phone,
    },
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt.toISOString(),
    messageCount: c.messageCount,
  };
}
