import { PROVIDERS } from '@partner/shared';
import { postJson } from './http.js';
import type { CompletionRequest, CompletionResult, ToolCall } from './types.js';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicResponse {
  content: Block[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Converts the internal OpenAI-style transcript to Anthropic Messages API format. */
export function toAnthropic(req: CompletionRequest) {
  const system = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const messages: { role: 'user' | 'assistant'; content: Block[] }[] = [];
  const push = (role: 'user' | 'assistant', blocks: Block[]) => {
    const last = messages[messages.length - 1];
    // Anthropic requires alternating roles; merge consecutive same-role turns (e.g. several tool results).
    if (last && last.role === role) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };
  for (const m of req.messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') push('user', [{ type: 'text', text: m.content }]);
    if (m.role === 'assistant') {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const t of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.arguments });
      if (blocks.length) push('assistant', blocks);
    }
    if (m.role === 'tool') push('user', [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }]);
  }
  return { system, messages };
}

export async function anthropicComplete(req: CompletionRequest): Promise<CompletionResult> {
  const { system, messages } = toAnthropic(req);
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? 1024,
    messages,
  };
  if (system) body.system = system;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }
  const data = await postJson<AnthropicResponse>(
    `${PROVIDERS.anthropic.baseUrl}/messages`,
    { 'x-api-key': req.apiKey, 'anthropic-version': '2023-06-01' },
    body,
    req.signal,
  );
  const text = data.content
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const toolCalls: ToolCall[] = data.content
    .filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, arguments: b.input ?? {} }));
  return {
    content: text || null,
    toolCalls,
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
  };
}
