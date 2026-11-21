import type { Channel } from '@prisma/client';
import { decryptJson } from '../lib/crypto.js';
import * as baileys from './baileys.js';
import * as cloud from './whatsapp-cloud.js';
import * as telegram from './telegram.js';

export const CHANNEL_LABEL: Record<Channel['type'], string> = {
  TELEGRAM: 'Telegram',
  WHATSAPP_QR: 'WhatsApp',
  WHATSAPP_CLOUD: 'WhatsApp',
};

export function telegramToken(c: Channel): string {
  const cfg = decryptJson<{ botToken: string }>(c.encryptedConfig);
  if (!cfg) throw new Error('Telegram channel is missing its bot token');
  return cfg.botToken;
}

export function cloudConfig(c: Channel): cloud.CloudConfig {
  const cfg = decryptJson<cloud.CloudConfig>(c.encryptedConfig);
  if (!cfg) throw new Error('WhatsApp Cloud channel is missing credentials');
  return cfg;
}

/** Sends a text message on any channel type. Returns the provider message id. */
export async function sendText(c: Channel, to: string, text: string): Promise<string> {
  switch (c.type) {
    case 'TELEGRAM':
      return telegram.sendMessage(telegramToken(c), to, text);
    case 'WHATSAPP_CLOUD':
      return cloud.sendText(cloudConfig(c), to, text);
    case 'WHATSAPP_QR':
      return baileys.sendText(c.id, to, text);
  }
}

/** Best-effort typing indicator. Never throws. */
export async function sendTyping(c: Channel, to: string, inboundExternalId?: string | null) {
  try {
    if (c.type === 'TELEGRAM') await telegram.sendTyping(telegramToken(c), to);
    else if (c.type === 'WHATSAPP_QR') await baileys.sendTyping(c.id, to);
    else if (c.type === 'WHATSAPP_CLOUD' && inboundExternalId)
      await cloud.markReadWithTyping(cloudConfig(c), inboundExternalId);
  } catch {
    /* typing indicators are cosmetic */
  }
}
