/**
 * Live plan details: the defaults in @cowork/shared, overridden by what admins saved (PlanSetting).
 * Kept in memory so limits can be read synchronously; refreshed on start, on every admin change
 * and once a minute.
 */
import {
  PLANS,
  PLAN_IDS,
  planFromJSON,
  planToJSON,
  type PlanDef,
  type PlanId,
  type PlanJSON,
} from '@cowork/shared';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';

let current: Record<PlanId, PlanDef> = { ...PLANS };
let timer: NodeJS.Timeout | null = null;

export function plan(id: PlanId): PlanDef {
  return current[id];
}

export function allPlans(): PlanDef[] {
  return PLAN_IDS.map((id) => current[id]);
}

export function allPlansJSON(): PlanJSON[] {
  return allPlans().map(planToJSON);
}

export async function refreshPlans() {
  const rows = await prisma.planSetting.findMany();
  const next = { ...PLANS };
  for (const row of rows) {
    const id = row.plan as PlanId;
    if (!PLANS[id]) continue;
    const saved = row.data as Partial<PlanJSON>;
    const merged = planToJSON(PLANS[id]);
    next[id] = planFromJSON({
      ...merged,
      ...saved,
      id,
      interval: PLANS[id].interval,
      limits: { ...merged.limits, ...(saved.limits ?? {}) },
    });
  }
  current = next;
}

export async function startPlanRefresh() {
  await refreshPlans().catch((err) => logger.warn({ err }, 'could not load plan settings'));
  timer ??= setInterval(() => {
    refreshPlans().catch((err) => logger.warn({ err }, 'could not refresh plan settings'));
  }, 60_000);
  timer.unref();
}

export function trialMs() {
  return plan('TRIAL').durationDays * 86_400_000;
}
