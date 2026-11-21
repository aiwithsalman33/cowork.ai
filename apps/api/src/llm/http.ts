import { scrubSecrets } from '../lib/logger.js';
import { LLMError } from './types.js';

const TIMEOUT_MS = 60_000;

export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch((err: unknown) => {
    throw new LLMError(`Network error contacting AI provider: ${(err as Error).message}`, 0, true);
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.error?.message ?? j.message ?? j.error ?? text;
      if (typeof msg !== 'string') msg = JSON.stringify(msg);
    } catch {
      /* keep text */
    }
    const retryable = res.status === 429 || res.status >= 500;
    const friendly =
      res.status === 401 || res.status === 403
        ? 'The AI provider rejected your API key. Check it in Agent Config → API Keys.'
        : res.status === 404
          ? `Model not found: ${scrubSecrets(msg).slice(0, 200)}`
          : `AI provider error (${res.status}): ${scrubSecrets(msg).slice(0, 300)}`;
    throw new LLMError(friendly, res.status, retryable);
  }
  return JSON.parse(text) as T;
}
