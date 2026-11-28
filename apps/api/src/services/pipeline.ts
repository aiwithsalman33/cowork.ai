import { Prisma, type Channel } from '@prisma/client';
import { prisma } from '../db/client.js';
import { logger, scrubSecrets } from '../lib/logger.js';
import { CHANNEL_LABEL, cloudConfig, sendText, sendTyping } from '../channels/index.js';
import {
  buildComponents,
  checkValues,
  renderSent,
  templateFields,
  unsupportedReason,
} from '../channels/template-fields.js';
import * as cloud from '../channels/whatsapp-cloud.js';
import type { NormalizedInbound } from '../channels/telegram.js';
import { enqueueInbound, enqueueSummarize } from '../queue/index.js';
import { resolveModels } from '../agent/keys.js';
import { runAgent } from '../agent/runtime.js';
import { handleBossMessage } from '../agent/boss-mode.js';
import { isBoss, linkCommand, linkTelegram } from './boss-link.js';
import { contactGate } from './contact-limits.js';
import { LLMError } from '../llm/index.js';
import { QuotaError } from '../llm/gateway.js';
import { canReply } from './plan.js';
import { logEvent } from './audit.js';
import { shouldSummarize } from './memory.js';

const FALLBACK_REPLY = 'Thanks for your message! Our team will get back to you shortly.';
const MAX_ATTEMPTS = 4;

/**
 * Step 1 (webhook / socket handler): persist the inbound message and enqueue it.
 * Idempotent — the unique dedupeKey drops provider retries/duplicates at insert time.
 */
export async function ingestInbound(
  channel: Channel,
  msg: NormalizedInbound,
): Promise<{ duplicate: boolean; messageId?: string }> {
  const dedupeKey = `${channel.type}:${channel.id}:${msg.dedupeId}`;
  const exists = await prisma.message.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (exists) return { duplicate: true, messageId: exists.id };

  const now = new Date();
  const contact = await prisma.contact.upsert({
    where: {
      userId_channelType_externalId: {
        userId: channel.userId,
        channelType: channel.type,
        externalId: msg.externalChatId,
      },
    },
    create: {
      userId: channel.userId,
      channelType: channel.type,
      externalId: msg.externalChatId,
      name: msg.name,
      phone: msg.phone,
      messageCount: 1,
    },
    update: {
      lastSeenAt: now,
      messageCount: { increment: 1 },
      ...(msg.name ? { name: msg.name } : {}),
      ...(msg.phone ? { phone: msg.phone } : {}),
    },
  });
  const conversation = await prisma.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
    create: { userId: channel.userId, channelId: channel.id, contactId: contact.id },
    update: {},
  });

  let messageId: string;
  try {
    const m = await prisma.message.create({
      data: {
        userId: channel.userId,
        conversationId: conversation.id,
        direction: 'IN',
        role: 'USER',
        content: msg.text,
        dedupeKey,
        externalId: msg.externalMessageId,
      },
    });
    messageId = m.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      return { duplicate: true };
    throw err;
  }
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now, lastMessage: msg.text.slice(0, 200), messageCount: { increment: 1 } },
  });
  await enqueueInbound(messageId);
  return { duplicate: false, messageId };
}

async function recordOutbound(params: {
  channel: Channel;
  conversationId: string;
  to: string;
  text: string;
  role: 'ASSISTANT' | 'SYSTEM' | 'OWNER';
  replyToId?: string;
  tokensIn?: number;
  tokensOut?: number;
  toolCalls?: { name: string; ok: boolean }[];
  /** custom sender (e.g. a WhatsApp template); defaults to a plain text message */
  send?: () => Promise<string>;
}) {
  const out = await prisma.message.create({
    data: {
      userId: params.channel.userId,
      conversationId: params.conversationId,
      direction: 'OUT',
      role: params.role,
      content: params.text,
      status: 'PROCESSING',
      replyToId: params.replyToId ?? null,
      tokensIn: params.tokensIn ?? 0,
      tokensOut: params.tokensOut ?? 0,
      toolCalls: params.toolCalls?.length
        ? (params.toolCalls as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });
  let externalId: string;
  try {
    externalId = await (params.send ? params.send() : sendText(params.channel, params.to, params.text));
  } catch (err) {
    await prisma.message.update({
      where: { id: out.id },
      data: { status: 'FAILED', error: scrubSecrets((err as Error).message), processedAt: new Date() },
    });
    throw err;
  }
  await prisma.message.update({
    where: { id: out.id },
    data: { status: 'SENT', externalId, processedAt: new Date() },
  });
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessage: params.text.slice(0, 200),
      messageCount: { increment: 1 },
    },
  });
  return out.id;
}

/** Owner replies manually from the inbox. */
export async function sendOwnerReply(conversationId: string, userId: string, text: string) {
  const convo = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, userId },
    include: { channel: true, contact: true },
  });
  return recordOutbound({
    channel: convo.channel,
    conversationId,
    to: convo.contact.externalId,
    text,
    role: 'OWNER',
  });
}

/** Meta reported that an accepted message was not delivered. */
export async function markUndelivered(channel: Channel, externalId: string, error: string, retry = true) {
  const msg = await prisma.message.findFirst({
    where: { userId: channel.userId, externalId, direction: 'OUT', conversation: { channelId: channel.id } },
    select: { id: true, status: true },
  });
  if (!msg) {
    // the report can arrive before our own send finished saving its id
    if (retry)
      setTimeout(() => {
        markUndelivered(channel, externalId, error, false).catch((err) =>
          logger.warn({ err: (err as Error).message }, 'delivery report failed'),
        );
      }, 3000).unref();
    return;
  }
  if (msg.status === 'FAILED') return;
  await prisma.message.update({ where: { id: msg.id }, data: { status: 'FAILED', error } });
  await logEvent(channel.userId, 'ERROR', 'message.undelivered', `WhatsApp message not delivered: ${error}`);
}

/** Finds or creates the conversation for a phone number on a WhatsApp Business API channel. */
export async function openCloudConversation(channel: Channel, phone: string) {
  const contact = await prisma.contact.upsert({
    where: {
      userId_channelType_externalId: {
        userId: channel.userId,
        channelType: channel.type,
        externalId: phone,
      },
    },
    create: { userId: channel.userId, channelType: channel.type, externalId: phone, phone },
    update: {},
  });
  return prisma.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
    create: { userId: channel.userId, channelId: channel.id, contactId: contact.id },
    update: {},
  });
}

/** Owner sends an approved WhatsApp Business API template from the inbox. */
export async function sendOwnerTemplate(
  conversationId: string,
  userId: string,
  templateId: string,
  params: string[],
) {
  const convo = await prisma.conversation.findFirstOrThrow({
    where: { id: conversationId, userId },
    include: { channel: true, contact: true },
  });
  if (convo.channel.type !== 'WHATSAPP_CLOUD')
    throw new Error('templates work only on WhatsApp Business API numbers');
  const t = await prisma.whatsAppTemplate.findFirst({
    where: { id: templateId, userId, channelId: convo.channelId },
  });
  if (!t) throw new Error('template not found');
  if (t.status !== 'APPROVED') throw new Error(`template is ${t.status.toLowerCase()}, not approved`);
  const blocked = unsupportedReason(t);
  if (blocked) throw new Error(blocked);
  const fields = templateFields(t);
  const problem = checkValues(fields, params);
  if (problem) throw new Error(problem);
  return recordOutbound({
    channel: convo.channel,
    conversationId,
    to: convo.contact.externalId,
    text: renderSent(t, fields, params),
    role: 'OWNER',
    send: () =>
      cloud.sendTemplate(
        cloudConfig(convo.channel),
        convo.contact.externalId,
        t,
        buildComponents(fields, params),
      ),
  });
}

/**
 * Step 2 (queue worker): decide whether/how to reply and send it. Safe to run more than once
 * for the same message: finished messages are skipped and a reply already SENT is never re-sent.
 */
export async function processInbound(messageId: string, attempt = 0): Promise<void> {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: { include: { channel: true, contact: true } },
      user: { include: { agent: true } },
    },
  });
  if (!msg || msg.direction !== 'IN') return;
  if (msg.status === 'REPLIED' || msg.status === 'SKIPPED' || msg.status === 'FAILED') return;

  const { conversation, user } = msg;
  const { channel, contact } = conversation;
  const label = CHANNEL_LABEL[channel.type];
  const finish = (status: 'REPLIED' | 'SKIPPED' | 'FAILED', error?: string) =>
    prisma.message.update({
      where: { id: msg.id },
      data: { status, processedAt: new Date(), error: error ?? null },
    });

  const alreadySent = await prisma.message.findFirst({
    where: { replyToId: msg.id, status: 'SENT' },
    select: { id: true },
  });
  if (alreadySent) {
    await finish('REPLIED');
    return;
  }

  // Telegram: "/boss CODE" links this Telegram account to Boss Mode (code from the web app).
  const linkCode = linkCommand(channel, msg.content);
  if (linkCode) {
    const reply = await linkTelegram(user.id, contact.externalId, linkCode);
    await recordOutbound({
      channel,
      conversationId: conversation.id,
      to: contact.externalId,
      text: reply,
      role: 'SYSTEM',
      replyToId: msg.id,
    });
    await finish('REPLIED');
    return;
  }

  // Boss Mode: the owner (verified WhatsApp number, or linked Telegram account).
  if (isBoss(user, channel, contact)) {
    await prisma.message.update({ where: { id: msg.id }, data: { role: 'OWNER' } });
    const reply = await handleBossMessage(user.id, msg.content);
    await recordOutbound({
      channel,
      conversationId: conversation.id,
      to: contact.externalId,
      text: reply,
      role: 'SYSTEM',
      replyToId: msg.id,
    });
    await finish('REPLIED');
    return;
  }

  // If the customer sent more messages after this one, let the newest message answer all of them.
  const newer = await prisma.message.findFirst({
    where: { conversationId: conversation.id, direction: 'IN', createdAt: { gt: msg.createdAt } },
    select: { id: true },
  });
  if (newer) {
    await finish('SKIPPED', 'merged_into_newer_message');
    return;
  }

  if (!channel.aiEnabled) {
    await finish('SKIPPED', 'channel_ai_off');
    return;
  }

  const gate = await canReply(user, user.agent?.isActive ?? true);
  if (!gate.ok) {
    await finish('SKIPPED', gate.reason);
    await logEvent(
      user.id,
      'WARN',
      `reply.${gate.reason}`,
      {
        plan_inactive:
          'Message not answered: your trial/subscription is inactive. Upgrade to resume replies.',
        message_limit: 'Message not answered: monthly AI reply limit reached. Upgrade for more.',
        agent_paused: 'Message not answered: your agent is paused.',
      }[gate.reason],
    );
    return;
  }

  const perContact = await contactGate(user.id, user.plan, contact);
  if (!perContact.ok) {
    await finish('SKIPPED', perContact.reason);
    return;
  }

  const models = await resolveModels(user.id);
  const model = models?.primary;
  if (!model) {
    await finish('SKIPPED', 'no_api_key');
    await logEvent(
      user.id,
      'WARN',
      'reply.no_api_key',
      'Message not answered: add an AI key in Agent Config → API Keys.',
    );
    return;
  }

  await prisma.message.update({ where: { id: msg.id }, data: { status: 'PROCESSING' } });
  await sendTyping(channel, contact.externalId, msg.externalId);

  try {
    const result = await runAgent({
      userId: user.id,
      conversationId: conversation.id,
      model,
      fallback: models.fallback,
      channelLabel: label,
      upToMessageId: msg.id,
    });
    const text = result.reply || FALLBACK_REPLY;
    await recordOutbound({
      channel,
      conversationId: conversation.id,
      to: contact.externalId,
      text,
      role: 'ASSISTANT',
      replyToId: msg.id,
      tokensIn: result.usage.input,
      tokensOut: result.usage.output,
      toolCalls: result.toolCalls,
    });
    await finish('REPLIED');
    for (const call of result.toolCalls.filter((c) => c.ok)) {
      await logEvent(
        user.id,
        'INFO',
        `tool.${call.name}`,
        `Agent used ${call.name.replace(/_/g, ' ')} for ${contact.name ?? contact.externalId}`,
      );
    }
    if (await shouldSummarize(conversation.id)) await enqueueSummarize(conversation.id);
  } catch (err) {
    // the gateway's quota check refused (plan/limit changed while this message waited)
    if (err instanceof QuotaError) {
      await finish('SKIPPED', err.reason);
      return;
    }
    const retryable = err instanceof LLMError ? err.retryable : true;
    const message = scrubSecrets(err instanceof Error ? err.message : String(err));
    logger.warn({ err: message, messageId, attempt }, 'inbound processing failed');
    if (retryable && attempt < MAX_ATTEMPTS - 1) {
      await prisma.message.update({ where: { id: msg.id }, data: { status: 'RECEIVED', error: message } });
      throw err; // let the queue retry with backoff
    }
    // final failure: the customer still gets a polite answer, exactly once (audit H5)
    const replied = await prisma.message.findFirst({
      where: { replyToId: msg.id, status: 'SENT' },
      select: { id: true },
    });
    if (!replied) {
      await recordOutbound({
        channel,
        conversationId: conversation.id,
        to: contact.externalId,
        text: FALLBACK_REPLY,
        role: 'ASSISTANT',
        replyToId: msg.id,
      }).catch((sendErr: Error) =>
        logger.warn({ err: scrubSecrets(sendErr.message), messageId }, 'fallback reply failed too'),
      );
    }
    await finish('FAILED', message);
    await logEvent(
      user.id,
      'ERROR',
      'reply.failed',
      `Could not reply to ${contact.name ?? contact.externalId}: ${message}`,
    );
  }
}
