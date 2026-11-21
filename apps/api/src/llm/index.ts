import { PROVIDERS } from '@partner/shared';
import { anthropicComplete } from './anthropic.js';
import { googleComplete } from './google.js';
import { openaiComplete } from './openai.js';
import type { CompletionRequest, CompletionResult } from './types.js';

export * from './types.js';

/** Single entry point for every provider. Internal format is OpenAI-style; adapters translate. */
export function complete(req: CompletionRequest): Promise<CompletionResult> {
  const style = PROVIDERS[req.provider].style;
  if (style === 'anthropic') return anthropicComplete(req);
  if (style === 'google') return googleComplete(req);
  return openaiComplete(req);
}
