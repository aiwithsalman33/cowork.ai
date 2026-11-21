import type { Prisma } from '@prisma/client';
import { TOOL_NAMES, type ToolName } from '@partner/shared';
import { loadGoogleState } from '../integrations/google.js';
import { prisma } from '../db/client.js';
import { complete, type ChatMessage, type ToolDef } from '../llm/index.js';
import type { ResolvedModel } from './keys.js';
import { composeSystemPrompt } from './prompt.js';
import { availableTools, runTool, TOOL_DEFS, type ToolContext } from './tools.js';

export const HISTORY_LIMIT = 16;
export const MAX_TOOL_ROUNDS = 5;
const TIME_ZONE = 'Asia/Kolkata';

interface PromptOptions {
  channel: string;
  contact?: {
    id: string;
    name: string | null;
    phone: string | null;
    profile: unknown;
    summary: string;
    messageCount: number;
  } | null;
  conversationSummary?: string;
}

async function loadGoogle(userId: string) {
  const [state, sheets] = await Promise.all([
    loadGoogleState(userId),
    prisma.agentSheet.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ]);
  // Sheets only work while Google is connected with Sheets access.
  return {
    google: state.services,
    googleSettings: state.settings,
    sheets: state.services.has('googlesheets') ? sheets : [],
  };
}

/** Builds the system prompt + tool list for a tenant (and optionally a specific contact). */
export async function buildAgentPrompt(userId: string, opts: PromptOptions) {
  const [agent, userSkills, g] = await Promise.all([
    prisma.agent.findUniqueOrThrow({ where: { userId } }),
    prisma.userSkill.findMany({ where: { userId, enabled: true }, include: { skill: true } }),
    loadGoogle(userId),
  ]);
  const requested = new Set<ToolName>();
  for (const us of userSkills)
    for (const t of us.skill.tools) if (TOOL_NAMES.includes(t as ToolName)) requested.add(t as ToolName);
  const toolNames = availableTools(requested, g);
  const tools: ToolDef[] = toolNames.map((t) => TOOL_DEFS[t]);

  const profile = (opts.contact?.profile ?? {}) as Record<string, unknown>;
  const summary = [opts.contact?.summary, opts.conversationSummary].filter(Boolean).join(' ').trim();
  const system = composeSystemPrompt({
    agent,
    skills: userSkills.map((us) => ({ name: us.skill.name, promptFragment: us.skill.promptFragment })),
    availableTools: toolNames,
    sheets: toolNames.includes('read_sheet') ? g.sheets.filter((s) => s.purpose === 'LOOKUP') : [],
    channel: opts.channel,
    timeZone: TIME_ZONE,
    memory: opts.contact
      ? {
          contactName: opts.contact.name,
          profile,
          summary,
          isReturning: opts.contact.messageCount > 1,
        }
      : undefined,
  });
  return { system, tools, g, agent };
}

export interface AgentRunResult {
  reply: string;
  usage: { input: number; output: number };
  toolCalls: { name: string; ok: boolean }[];
}

/**
 * Runs one agent turn for a conversation: loads recent history, calls the model, executes tools
 * (max MAX_TOOL_ROUNDS rounds) and returns the final text reply.
 */
export async function runAgent(params: {
  userId: string;
  conversationId: string;
  model: ResolvedModel;
  channelLabel: string;
  upToMessageId?: string;
}): Promise<AgentRunResult> {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: params.conversationId },
    include: { contact: true },
  });
  const { system, tools, g } = await buildAgentPrompt(params.userId, {
    channel: params.channelLabel,
    contact: conversation.contact,
    conversationSummary: conversation.summary,
  });

  const cutoff = params.upToMessageId
    ? (await prisma.message.findUnique({ where: { id: params.upToMessageId }, select: { createdAt: true } }))
        ?.createdAt
    : undefined;
  const history = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
      role: { in: ['USER', 'ASSISTANT'] },
      ...(conversation.summarizedUntil
        ? { createdAt: { gt: conversation.summarizedUntil, ...(cutoff ? { lte: cutoff } : {}) } }
        : cutoff
          ? { createdAt: { lte: cutoff } }
          : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });
  history.reverse();

  const messages: ChatMessage[] = [{ role: 'system', content: system }];
  for (const m of history) {
    if (m.role === 'USER') messages.push({ role: 'user', content: m.content });
    else if (m.content) messages.push({ role: 'assistant', content: m.content });
  }
  // models require the transcript to end with a user turn
  if (messages[messages.length - 1]?.role !== 'user') messages.push({ role: 'user', content: '(continue)' });

  const ctx: ToolContext = {
    userId: params.userId,
    contactId: conversation.contactId,
    contactName: conversation.contact.name,
    contactPhone: conversation.contact.phone,
    channelLabel: params.channelLabel,
    timeZone: TIME_ZONE,
    google: g.google,
    googleSettings: g.googleSettings,
    sheets: g.sheets,
  };

  const usage = { input: 0, output: 0 };
  const calls: { name: string; ok: boolean }[] = [];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await complete({
      ...params.model,
      messages,
      tools: round < MAX_TOOL_ROUNDS && tools.length ? tools : undefined,
      temperature: 0.5,
      maxTokens: 700,
    });
    usage.input += res.usage.input;
    usage.output += res.usage.output;
    if (!res.toolCalls.length) {
      return { reply: (res.content ?? '').trim(), usage, toolCalls: calls };
    }
    messages.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
    for (const tc of res.toolCalls) {
      const allowed = tools.some((t) => t.name === tc.name);
      const out = allowed
        ? await runTool(tc.name, tc.arguments, ctx)
        : { ok: false, error: 'Tool not available' };
      calls.push({ name: tc.name, ok: out.ok === true });
      messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: JSON.stringify(out) });
    }
  }
  return { reply: '', usage, toolCalls: calls };
}

export type ToolCallsJson = Prisma.InputJsonValue;
