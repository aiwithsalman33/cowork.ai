import { PROVIDERS } from '@cowork/shared';
import { anthropicComplete } from './anthropic.js';
import { googleComplete } from './google.js';
import { openaiComplete } from './openai.js';
import type { CompletionRequest, CompletionResult } from './types.js';
import { env } from '../config.js';
import { fakeComplete } from './fake.js';

export * from './types.js';

/** Single entry point for every provider. Internal format is OpenAI-style; adapters translate. */
export function complete(req: CompletionRequest): Promise<CompletionResult> {
  if (env.LLM_FAKE) return Promise.resolve(fakeComplete(req));
  const style = PROVIDERS[req.provider].style;
  if (style === 'anthropic') return anthropicComplete(req);
  if (style === 'google') return googleComplete(req);
  return openaiComplete(req);
}
