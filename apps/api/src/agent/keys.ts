import { PROVIDER_IDS, type ProviderId } from '@cowork/shared';
import { prisma } from '../db/client.js';
import { decrypt } from '../lib/crypto.js';

export interface ResolvedModel {
  provider: ProviderId;
  model: string;
  apiKey: string;
}

/** Decrypts the tenant's active provider key. Returns null if none is configured. */
export async function resolveModel(userId: string): Promise<ResolvedModel | null> {
  const agent = await prisma.agent.findUnique({ where: { userId }, select: { provider: true, model: true } });
  if (!agent?.provider) return null;
  const key = await prisma.apiKey.findUnique({
    where: { userId_provider: { userId, provider: agent.provider } },
  });
  if (!key) return null;
  const provider = agent.provider as ProviderId;
  if (!PROVIDER_IDS.includes(provider)) return null;
  return { provider, model: agent.model ?? key.model, apiKey: decrypt(key.encryptedKey) };
}

/** Primary model plus the optional fallback (a different saved key), for the customer reply path. */
export async function resolveModels(
  userId: string,
): Promise<{ primary: ResolvedModel; fallback: ResolvedModel | null } | null> {
  const primary = await resolveModel(userId);
  if (!primary) return null;
  const agent = await prisma.agent.findUnique({
    where: { userId },
    select: { fallbackProvider: true, fallbackModel: true },
  });
  const fp = agent?.fallbackProvider as ProviderId | null | undefined;
  if (!fp || !PROVIDER_IDS.includes(fp)) return { primary, fallback: null };
  const key = await prisma.apiKey.findUnique({ where: { userId_provider: { userId, provider: fp } } });
  if (!key) return { primary, fallback: null };
  const fallback = {
    provider: fp,
    model: agent?.fallbackModel ?? key.model,
    apiKey: decrypt(key.encryptedKey),
  };
  // the same model twice is not a fallback
  return fallback.provider === primary.provider && fallback.model === primary.model
    ? { primary, fallback: null }
    : { primary, fallback };
}
