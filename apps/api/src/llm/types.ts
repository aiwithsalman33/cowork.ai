import type { ProviderId } from '@cowork/shared';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** provider-specific raw part to echo back verbatim (e.g. Gemini thought signatures) */
  raw?: unknown;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema (object) */
  parameters: Record<string, unknown>;
}

export interface CompletionRequest {
  provider: ProviderId;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  /** ask for a JSON object response where supported */
  json?: boolean;
  signal?: AbortSignal;
}

export interface CompletionResult {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
}

export class LLMError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}
