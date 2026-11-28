/**
 * Deterministic stand-in for a real model (LLM_FAKE=true): for tests, local development and load
 * tests. Costs nothing and never calls a provider.
 * - Reply: "[fake] <first 80 characters of the last user message>"
 * - Tool call: only when the last user message contains "#tool:<name>" and that tool is offered,
 *   and only once per turn (after the tool result it answers normally).
 */
import type { CompletionRequest, CompletionResult } from './types.js';

export function fakeComplete(req: CompletionRequest): CompletionResult {
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
  const text = lastUser && lastUser.role === 'user' ? lastUser.content : '';
  const lastIsToolResult = req.messages[req.messages.length - 1]?.role === 'tool';
  const wanted = /#tool:([a-z_]+)/i.exec(text)?.[1];
  if (wanted && !lastIsToolResult && req.tools?.some((t) => t.name === wanted)) {
    return {
      content: null,
      toolCalls: [{ id: `fake_${wanted}`, name: wanted, arguments: {} }],
      usage: { input: 0, output: 0 },
    };
  }
  return {
    content: req.json ? '{}' : `[fake] ${text.slice(0, 80)}`,
    toolCalls: [],
    usage: { input: 0, output: 0 },
  };
}
