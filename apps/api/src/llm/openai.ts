import { PROVIDERS } from '@partner/shared';
import { postJson } from './http.js';
import type { ChatMessage, CompletionRequest, CompletionResult, ToolCall } from './types.js';

interface OAIResponse {
  choices: {
    message: {
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function toOAI(m: ChatMessage) {
  switch (m.role) {
    case 'system':
    case 'user':
      return { role: m.role, content: m.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content ?? '',
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((t) => ({
                id: t.id,
                type: 'function',
                function: { name: t.name, arguments: JSON.stringify(t.arguments) },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
}

/** OpenAI reasoning-family models reject `temperature` and `max_tokens`. */
function isReasoningModel(model: string) {
  return /^(o\d|gpt-5)/.test(model);
}

export async function openaiComplete(req: CompletionRequest): Promise<CompletionResult> {
  const p = PROVIDERS[req.provider];
  const reasoning = req.provider === 'openai' && isReasoningModel(req.model);
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map(toOAI),
  };
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (!reasoning && req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxTokens) body[req.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = req.maxTokens;
  if (req.json) body.response_format = { type: 'json_object' };

  const headers: Record<string, string> = { authorization: `Bearer ${req.apiKey}` };
  if (req.provider === 'openrouter') headers['X-Title'] = 'partner.ai';

  const data = await postJson<OAIResponse>(`${p.baseUrl}/chat/completions`, headers, body, req.signal);
  const msg = data.choices[0]?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      args = { _raw: tc.function.arguments };
    }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });
  return {
    content: msg?.content ?? null,
    toolCalls,
    usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
  };
}
