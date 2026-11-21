import type { Channel, Contact, Conversation } from '@prisma/client';
import type { ChannelDTO, ConversationDTO } from '@partner/shared';
import { env } from '../config.js';

export function webhookUrlFor(channel: Pick<Channel, 'id' | 'type'>): string | null {
  if (channel.type === 'WHATSAPP_CLOUD') return `${env.PUBLIC_API_URL}/webhooks/whatsapp/${channel.id}`;
  if (channel.type === 'TELEGRAM') return `${env.PUBLIC_API_URL}/webhooks/telegram/${channel.id}`;
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
    webhookUrl: webhookUrlFor(c),
    // The Cloud API verify token is not a credential (Meta only echoes it back); the owner must paste it in Meta.
    verifyToken: c.type === 'WHATSAPP_CLOUD' ? c.webhookSecret : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toConversationDTO(c: Conversation & { contact: Contact; channel: Channel }): ConversationDTO {
  return {
    id: c.id,
    channelType: c.channel.type,
    channelName: c.channel.name,
    contact: { id: c.contact.id, name: c.contact.name, externalId: c.contact.externalId, phone: c.contact.phone },
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt.toISOString(),
    messageCount: c.messageCount,
  };
}
