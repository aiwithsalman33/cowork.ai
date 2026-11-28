/**
 * Maintenance switches (audit M5), toggled in Admin → Feature flags:
 *  - maintenance_read_only     → tenants cannot change anything (non-GET /api/* answers 503)
 *  - maintenance_agent_paused  → incoming messages are saved but the agent does not reply
 * Unlike normal flags these are OFF when missing, and any lookup error fails OPEN (stays off):
 * a database hiccup must never lock the whole product.
 */
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';

export const READ_ONLY = 'maintenance_read_only';
export const AGENT_PAUSED = 'maintenance_agent_paused';
const TTL_MS = 5_000;
const cache = new Map<string, { on: boolean; at: number }>();

export async function maintenanceOn(key: typeof READ_ONLY | typeof AGENT_PAUSED): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.on;
  try {
    const row = await prisma.featureFlag.findUnique({ where: { key }, select: { enabled: true } });
    const on = row?.enabled ?? false;
    cache.set(key, { on, at: Date.now() });
    return on;
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, 'maintenance flag lookup failed; staying open');
    return false;
  }
}

export function clearMaintenanceCache() {
  cache.clear();
}

/** Paths that keep working in read-only mode: sign-in, admins, providers' webhooks, health checks. */
export function writeAllowedDuringMaintenance(url: string): boolean {
  const path = url.split('?')[0]!;
  return (
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/admin/') ||
    path.startsWith('/webhooks/') ||
    path.startsWith('/health') ||
    !path.startsWith('/api/')
  );
}
