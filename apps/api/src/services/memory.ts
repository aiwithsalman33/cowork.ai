/**
 * Customer memory:
 *  - Contact.profile: learned facts (name, email, location, preferences, interests …) as JSON
 *  - Contact.summary: one-paragraph description of the customer across conversations
 *  - Conversation.summary + summarizedUntil: rolling compression of long threads. runAgent only
 *    loads messages after summarizedUntil, so long chats stay cheap.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { generate } from '../llm/gateway.js';
import { resolveModel } from '../agent/keys.js';
import { logger } from '../lib/logger.js';
import {
  MEMORY_SYSTEM,
  memoryInput,
  PROMPT_VERSION as MEMORY_PROMPT_VERSION,
} from '../llm/prompts/memory.js';

export const COMPRESS_AFTER = 24; // unsummarized messages before compressing
export const KEEP_RECENT = 8; // always keep this many recent messages verbatim
export const PROFILE_EVERY = 8; // refresh learned facts every N user messages

async function unsummarizedCount(conversationId: string, since: Date | null) {
  return prisma.message.count({
    where: {
      conversationId,
      role: { in: ['USER', 'ASSISTANT'] },
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  });
}

export async function shouldSummarize(conversationId: string): Promise<boolean> {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!c) return false;
  if ((await unsummarizedCount(conversationId, c.summarizedUntil)) > COMPRESS_AFTER) return true;
  const userMsgs = await prisma.message.count({ where: { conversationId, direction: 'IN' } });
  return userMsgs >= 3 && userMsgs % PROFILE_EVERY === 3; // early first pass, then every N
}

/** A "fact" that tries to give the assistant orders is dropped (audit H1). */
const INSTRUCTION_LIKE =
  /\b(ignore|disregard)\b|system prompt|instructions?\b|you are now|act as|new rules?/i;
export function safeFacts(raw: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, v]) => typeof v === 'string' && v.trim() !== '' && !INSTRUCTION_LIKE.test(v))
      .map(([k, v]) => [k, (v as string).slice(0, 200)]),
  );
}

export async function summarizeConversation(conversationId: string): Promise<void> {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!convo) return;
  const model = await resolveModel(convo.userId);
  if (!model) return;

  const msgs = await prisma.message.findMany({
    where: {
      conversationId,
      role: { in: ['USER', 'ASSISTANT'] },
      ...(convo.summarizedUntil ? { createdAt: { gt: convo.summarizedUntil } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 80,
  });
  if (msgs.length === 0) return;

  const compress = msgs.length > COMPRESS_AFTER;
  const toSummarize = compress ? msgs.slice(0, msgs.length - KEEP_RECENT) : msgs;
  const transcript = toSummarize
    .map((m) => `${m.role === 'USER' ? 'Customer' : 'Assistant'}: ${m.content.slice(0, 600)}`)
    .join('\n');

  const res = await generate(
    { userId: convo.userId, feature: 'memory', promptVersion: MEMORY_PROMPT_VERSION },
    {
      ...model,
      json: true,
      temperature: 0.2,
      maxTokens: 600,
      messages: [
        { role: 'system', content: MEMORY_SYSTEM },
        {
          role: 'user',
          content: memoryInput({
            summary: convo.summary,
            customer: convo.contact.summary,
            facts: convo.contact.profile,
            transcript,
          }),
        },
      ],
    },
  );

  let parsed: { summary?: string; customer?: string; facts?: Record<string, unknown> } = {};
  try {
    parsed = JSON.parse(res.content?.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  } catch {
    logger.warn({ conversationId }, 'memory summarizer returned invalid JSON');
    return;
  }

  const facts = safeFacts(parsed.facts ?? {});
  const mergedProfile = { ...((convo.contact.profile as Record<string, unknown>) ?? {}), ...facts };

  await prisma.$transaction([
    prisma.contact.update({
      where: { id: convo.contactId },
      data: {
        profile: mergedProfile as Prisma.InputJsonValue,
        ...(parsed.customer ? { summary: parsed.customer.slice(0, 1000) } : {}),
        ...(!convo.contact.name && typeof facts.name === 'string' ? { name: facts.name } : {}),
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(parsed.summary ? { summary: parsed.summary.slice(0, 2000) } : {}),
        ...(compress ? { summarizedUntil: toSummarize[toSummarize.length - 1]!.createdAt } : {}),
      },
    }),
    // token usage of memory upkeep is counted towards the tenant's usage (system message, not a reply)
    prisma.message.create({
      data: {
        userId: convo.userId,
        conversationId,
        direction: 'OUT',
        role: 'SYSTEM',
        content: compress
          ? `[memory] compressed ${toSummarize.length} messages`
          : '[memory] updated customer profile',
        status: 'SENT',
        tokensIn: res.usage.input,
        tokensOut: res.usage.output,
      },
    }),
  ]);
}
