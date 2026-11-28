/**
 * The one way into a model (audit M1 + M4). Every AI call in the app goes through generate():
 *
 *   BEFORE  injectionGuard → quotaCheck
 *   CALL    callWithFallback (primary model, then the tenant's fallback model on a retryable error)
 *   AFTER   trace → usageRecord   (also on failure, with ok=false)
 *
 * Hook arrays are exported so their order is visible and tested. Prompt text is never logged.
 */
import type { ProviderId } from '@cowork/shared';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { canReply } from '../services/plan.js';
import { complete } from './index.js';
import { LLMError, type CompletionRequest, type CompletionResult } from './types.js';

export type Feature = 'agent_reply' | 'memory' | 'skill_creator' | 'boss' | 'key_test';

export interface ModelRef {
  provider: ProviderId;
  model: string;
  apiKey: string;
}

export interface GatewayContext {
  userId: string;
  feature: Feature;
  /** e.g. "agent@2" — which prompt produced this call */
  promptVersion: string;
  /** used only on a retryable error from the primary model */
  fallback?: ModelRef | null;
  meta: {
    injectionSuspected?: boolean;
    fallback?: boolean;
    provider?: string;
    model?: string;
    latencyMs?: number;
    errorCode?: string;
  };
}

export class QuotaError extends Error {
  constructor(public reason: string) {
    super(`AI reply blocked: ${reason}`);
  }
}

type Before = (ctx: GatewayContext, req: CompletionRequest) => Promise<void>;
type After = (ctx: GatewayContext, req: CompletionRequest, res: CompletionResult | null) => Promise<void>;

const INJECTION =
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)|disregard (your|the|all) (rules|instructions)|system prompt|you are now|developer mode|reveal (your|the) (instructions|prompt)/i;

/** Flags (never blocks) messages that look like prompt injection, for tracing and evals. */
export const injectionGuard: Before = async (ctx, req) => {
  const last = [...req.messages].reverse().find((m) => m.role === 'user');
  if (last && last.role === 'user' && INJECTION.test(last.content)) ctx.meta.injectionSuspected = true;
};

/** Customer replies stop when the plan, the monthly limit or the pause switch says so. */
export const quotaCheck: Before = async (ctx) => {
  if (ctx.feature !== 'agent_reply') return;
  const user = await prisma.user.findUnique({ where: { id: ctx.userId }, include: { agent: true } });
  if (!user) throw new QuotaError('unknown_user');
  const gate = await canReply(user, user.agent?.isActive ?? true);
  if (!gate.ok) throw new QuotaError(gate.reason);
};

export const trace: After = async (ctx, req, res) => {
  logger.info(
    {
      llm: {
        feature: ctx.feature,
        promptVersion: ctx.promptVersion,
        provider: ctx.meta.provider ?? req.provider,
        model: ctx.meta.model ?? req.model,
        tokensIn: res?.usage.input ?? 0,
        tokensOut: res?.usage.output ?? 0,
        latencyMs: ctx.meta.latencyMs,
        fallback: !!ctx.meta.fallback,
        injectionSuspected: !!ctx.meta.injectionSuspected,
        ok: !!res,
        errorCode: ctx.meta.errorCode,
      },
      userId: ctx.userId,
    },
    'llm call',
  );
};

export const usageRecord: After = async (ctx, req, res) => {
  try {
    await prisma.usageEvent.create({
      data: {
        userId: ctx.userId,
        feature: ctx.feature,
        provider: ctx.meta.provider ?? req.provider,
        model: ctx.meta.model ?? req.model,
        promptVersion: ctx.promptVersion,
        tokensIn: res?.usage.input ?? 0,
        tokensOut: res?.usage.output ?? 0,
        latencyMs: ctx.meta.latencyMs ?? 0,
        ok: !!res,
        fallback: !!ctx.meta.fallback,
        errorCode: ctx.meta.errorCode ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'could not record AI usage'); // never fail the reply
  }
};

export const BEFORE_HOOKS: readonly Before[] = [injectionGuard, quotaCheck];
export const AFTER_HOOKS: readonly After[] = [trace, usageRecord];

async function callWithFallback(ctx: GatewayContext, req: CompletionRequest): Promise<CompletionResult> {
  try {
    return await complete(req);
  } catch (err) {
    const fb = ctx.fallback;
    if (!(err instanceof LLMError) || !err.retryable || !fb) throw err;
    logger.warn(
      { userId: ctx.userId, feature: ctx.feature, status: err.status },
      'primary model failed, using fallback',
    );
    ctx.meta.fallback = true;
    ctx.meta.provider = fb.provider;
    ctx.meta.model = fb.model;
    return complete({ ...req, provider: fb.provider, model: fb.model, apiKey: fb.apiKey });
  }
}

export async function generate(
  ctx: Omit<GatewayContext, 'meta'> & { meta?: GatewayContext['meta'] },
  req: CompletionRequest,
): Promise<CompletionResult> {
  const c: GatewayContext = { ...ctx, meta: ctx.meta ?? {} };
  for (const hook of BEFORE_HOOKS) await hook(c, req);
  const started = Date.now();
  let res: CompletionResult | null = null;
  try {
    res = await callWithFallback(c, req);
    return res;
  } catch (err) {
    c.meta.errorCode =
      err instanceof LLMError ? `llm_${err.status}` : err instanceof Error ? err.name : 'error';
    throw err;
  } finally {
    c.meta.latencyMs = Date.now() - started;
    for (const hook of AFTER_HOOKS) await hook(c, req, res);
  }
}
