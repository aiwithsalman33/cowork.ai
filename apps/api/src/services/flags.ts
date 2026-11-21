import { prisma } from '../db/client.js';

const cache = new Map<string, { enabled: boolean; plans: string[]; at: number }>();
const TTL = 30_000;

/** A flag is on when enabled globally and (no plan restriction OR the user's plan is listed). */
export async function isFlagEnabled(key: string, userId?: string): Promise<boolean> {
  let f = cache.get(key);
  if (!f || Date.now() - f.at > TTL) {
    const row = await prisma.featureFlag.findUnique({ where: { key } });
    f = { enabled: row?.enabled ?? true, plans: row?.plans ?? [], at: Date.now() };
    cache.set(key, f);
  }
  if (!f.enabled) return false;
  if (!f.plans.length || !userId) return true;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return !!u && f.plans.includes(u.plan);
}

export function invalidateFlags() {
  cache.clear();
}
