import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config.js';
import { complete } from '../src/llm/index.js';
import { fakeComplete } from '../src/llm/fake.js';

const base = { provider: 'openai' as const, model: 'm', apiKey: 'k' };
afterEach(() => {
  env.LLM_FAKE = false;
  vi.restoreAllMocks();
});

describe('LLM_FAKE', () => {
  it('echoes the last user message and costs nothing', () => {
    const r = fakeComplete({
      ...base,
      messages: [{ role: 'user', content: 'What are your timings today?' }],
    });
    expect(r).toEqual({
      content: '[fake] What are your timings today?',
      toolCalls: [],
      usage: { input: 0, output: 0 },
    });
  });

  it('calls a tool only when asked with #tool:<name>, once per turn', () => {
    const tools = [{ name: 'capture_lead', description: 'd', parameters: {} }];
    const ask = fakeComplete({
      ...base,
      tools,
      messages: [{ role: 'user', content: 'save me #tool:capture_lead' }],
    });
    expect(ask.toolCalls.map((t) => t.name)).toEqual(['capture_lead']);
    const after = fakeComplete({
      ...base,
      tools,
      messages: [
        { role: 'user', content: 'save me #tool:capture_lead' },
        { role: 'assistant', content: null, toolCalls: ask.toolCalls },
        { role: 'tool', toolCallId: 'fake_capture_lead', name: 'capture_lead', content: '{}' },
      ],
    });
    expect(after.toolCalls).toEqual([]);
    // a tool that is not offered is never called
    expect(
      fakeComplete({ ...base, messages: [{ role: 'user', content: '#tool:send_email' }] }).toolCalls,
    ).toEqual([]);
  });

  it('complete() uses it when the flag is on and never calls a provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    env.LLM_FAKE = true;
    const r = await complete({ ...base, messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('[fake] hi');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
