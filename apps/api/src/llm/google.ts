import { randomUUID } from 'node:crypto';
import { PROVIDERS } from '@partner/shared';
import { postJson } from './http.js';
import type { CompletionRequest, CompletionResult, ToolCall } from './types.js';

type Part =
  | { text: string; thought?: boolean }
  | { functionCall: { name: string; args?: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiResponse {
  candidates?: { content?: { parts?: Part[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const UNSUPPORTED_SCHEMA_KEYS = new Set(['additionalProperties', '$schema', 'default', 'examples']);

/** Gemini accepts an OpenAPI subset of JSON Schema — drop keys it rejects. */
export function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (schema && typeof schema === 'object') {
    return Object.fromEntries(
      Object.entries(schema as Record<string, unknown>)
        .filter(([k]) => !UNSUPPORTED_SCHEMA_KEYS.has(k))
        .map(([k, v]) => [k, cleanSchema(v)]),
    );
  }
  return schema;
}

export function toGemini(req: CompletionRequest) {
  const system = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const contents: { role: 'user' | 'model'; parts: Part[] }[] = [];
  const push = (role: 'user' | 'model', parts: Part[]) => {
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };
  for (const m of req.messages) {
    if (m.role === 'user') push('user', [{ text: m.content }]);
    if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const t of m.toolCalls ?? []) {
        // echo the original part (keeps thoughtSignature, required by Gemini 2.5+ for multi-turn tool use)
        parts.push((t.raw as Part) ?? { functionCall: { name: t.name, args: t.arguments } });
      }
      if (parts.length) push('model', parts);
    }
    if (m.role === 'tool') {
      let response: Record<string, unknown>;
      try {
        const parsed = JSON.parse(m.content);
        response =
          parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { result: parsed };
      } catch {
        response = { result: m.content };
      }
      push('user', [{ functionResponse: { name: m.name, response } }]);
    }
  }
  return { system, contents };
}

export async function googleComplete(req: CompletionRequest): Promise<CompletionResult> {
  const { system, contents } = toGemini(req);
  const body: Record<string, unknown> = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (req.tools?.length) {
    body.tools = [
      {
        functionDeclarations: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: cleanSchema(t.parameters),
        })),
      },
    ];
  }
  const generationConfig: Record<string, unknown> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.maxTokens) generationConfig.maxOutputTokens = req.maxTokens;
  if (req.json && !req.tools?.length) generationConfig.responseMimeType = 'application/json';
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

  const url = `${PROVIDERS.google.baseUrl}/models/${encodeURIComponent(req.model)}:generateContent`;
  const data = await postJson<GeminiResponse>(url, { 'x-goog-api-key': req.apiKey }, body, req.signal);
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p): p is { text: string; thought?: boolean } => 'text' in p && !p.thought)
    .map((p) => p.text)
    .join('');
  const toolCalls: ToolCall[] = parts
    .filter((p): p is Extract<Part, { functionCall: unknown }> => 'functionCall' in p)
    .map((p) => ({
      id: randomUUID(),
      name: p.functionCall.name,
      arguments: p.functionCall.args ?? {},
      raw: p,
    }));
  return {
    content: text || null,
    toolCalls,
    usage: {
      input: data.usageMetadata?.promptTokenCount ?? 0,
      output: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
