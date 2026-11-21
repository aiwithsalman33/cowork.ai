import { Composio } from '@composio/core';
import type { Toolkit } from '@partner/shared';
import { env } from '../config.js';
import { logger } from '../lib/logger.js';

/**
 * Thin wrapper over @composio/core 0.31 (verified against the installed type definitions):
 *  - connectedAccounts.link(userId, authConfigId, { callbackUrl }) → { id, redirectUrl }
 *    (connectedAccounts.initiate() is retired for Composio-managed OAuth as of 2026)
 *  - connectedAccounts.get(id) → { id, status, toolkit: { slug } }
 *  - connectedAccounts.list({ userIds, toolkitSlugs, statuses }) → { items }
 *  - connectedAccounts.delete(id)
 *  - tools.execute(slug, { userId, arguments, connectedAccountId, version | dangerouslySkipVersionCheck })
 *      → { data, error, successful }
 * The tenant's userId is used as the Composio user (entity) id.
 */

let client: Composio | null = null;

export function composioEnabled(): boolean {
  return !!env.COMPOSIO_API_KEY;
}

function getClient(): Composio {
  if (!env.COMPOSIO_API_KEY) throw new Error('Composio is not configured (COMPOSIO_API_KEY missing)');
  client ??= new Composio({ apiKey: env.COMPOSIO_API_KEY });
  return client;
}

const AUTH_CONFIG_ENV: Record<Toolkit, string | undefined> = {
  gmail: env.COMPOSIO_AUTH_CONFIG_GMAIL,
  googlecalendar: env.COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR,
  googlesheets: env.COMPOSIO_AUTH_CONFIG_GOOGLESHEETS,
  googledrive: env.COMPOSIO_AUTH_CONFIG_GOOGLEDRIVE,
  googledocs: env.COMPOSIO_AUTH_CONFIG_GOOGLEDOCS,
};

export function isToolkitConfigured(toolkit: Toolkit): boolean {
  return composioEnabled() && !!AUTH_CONFIG_ENV[toolkit];
}

export async function startConnection(userId: string, toolkit: Toolkit, callbackUrl: string) {
  const authConfigId = AUTH_CONFIG_ENV[toolkit];
  if (!authConfigId) throw new Error(`No Composio auth config set for ${toolkit}`);
  const req = await getClient().connectedAccounts.link(userId, authConfigId, { callbackUrl });
  return { connectedAccountId: req.id, redirectUrl: req.redirectUrl ?? null };
}

export async function getConnectionStatus(connectedAccountId: string): Promise<string | null> {
  try {
    const acc = await getClient().connectedAccounts.get(connectedAccountId);
    return acc.status;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'composio get connected account failed');
    return null;
  }
}

/** Finds an ACTIVE account for this user+toolkit (used when the callback id is missing). */
export async function findActiveAccount(userId: string, toolkit: Toolkit): Promise<string | null> {
  const res = await getClient().connectedAccounts.list({ userIds: [userId], toolkitSlugs: [toolkit], statuses: ['ACTIVE'] });
  return res.items[0]?.id ?? null;
}

export async function disconnect(connectedAccountId: string) {
  await getClient().connectedAccounts.delete(connectedAccountId);
}

function versionFor(slug: string): { version: string } | { dangerouslySkipVersionCheck: true } {
  const toolkit = slug.split('_')[0]!;
  const pinned = process.env[`COMPOSIO_TOOLKIT_VERSION_${toolkit}`];
  return pinned ? { version: pinned } : { dangerouslySkipVersionCheck: true };
}

export interface ExecResult {
  ok: boolean;
  data: Record<string, unknown>;
  error: string | null;
}

export async function executeTool(
  userId: string,
  slug: string,
  args: Record<string, unknown>,
  connectedAccountId?: string | null,
): Promise<ExecResult> {
  const res = await getClient().tools.execute(slug, {
    userId,
    arguments: args,
    ...(connectedAccountId ? { connectedAccountId } : {}),
    ...versionFor(slug),
  });
  return { ok: res.successful, data: res.data ?? {}, error: res.error };
}

/** Admin diagnostic: fetch the live input schema of a tool so slug/argument mismatches are visible. */
export async function describeTool(slug: string) {
  const tool = await getClient().tools.getRawComposioToolBySlug(slug);
  const t = tool as unknown as { slug?: string; name?: string; inputParameters?: { properties?: Record<string, unknown>; required?: string[] } };
  return {
    slug: t.slug ?? slug,
    name: t.name ?? slug,
    properties: Object.keys(t.inputParameters?.properties ?? {}),
    required: t.inputParameters?.required ?? [],
  };
}
