import { describe, expect, it } from 'vitest';
import { composeSystemPrompt, type PromptAgent } from '../src/agent/prompt.js';
import { toAnthropic } from '../src/llm/anthropic.js';
import { cleanSchema, toGemini } from '../src/llm/google.js';
import { buildAgentPrompt } from '../src/agent/runtime.js';
import { prisma, signup } from './helpers.js';

const agent: PromptAgent = {
  name: 'Asha',
  businessName: 'Sharma Dental',
  tone: 'friendly',
  language: 'Auto-detect',
  greeting: 'Welcome to Sharma Dental!',
  instructions: 'Always mention free parking.',
  emojis: false,
  replyLength: 'short',
  businessDetails: 'Open Mon–Sat 10am–7pm, Indiranagar, Bengaluru.',
  productsServices: 'Cleaning ₹800; Whitening ₹4,500',
  commonQuestions: 'Q: Do you take insurance? A: Yes, most major insurers.',
};

describe('composeSystemPrompt', () => {
  it('includes personality, knowledge base and skills in order', () => {
    const p = composeSystemPrompt({
      agent,
      skills: [{ name: 'FAQ Bot', promptFragment: 'Answer FAQs from the knowledge base.' }],
      channel: 'WhatsApp',
      now: new Date('2026-11-21T10:00:00Z'),
    });
    expect(p).toContain('You are Asha, the AI assistant for Sharma Dental');
    expect(p).toContain('on WhatsApp');
    expect(p).toContain('Tone: friendly');
    expect(p).toContain('Do not use emojis');
    expect(p).toContain('Always mention free parking.');
    expect(p).toContain('Cleaning ₹800');
    expect(p).toContain('Do you take insurance?');
    expect(p).toContain('- FAQ Bot: Answer FAQs from the knowledge base.');
    const order = [
      'Owner instructions',
      'Business details',
      'Products & services',
      'Common questions',
      '## Skills',
    ].map((h) => p.indexOf(h));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('omits empty sections and adds memory when present', () => {
    const p = composeSystemPrompt({
      agent: { ...agent, commonQuestions: '', instructions: '' },
      skills: [],
      memory: {
        contactName: 'Rahul',
        profile: { preferred_time: 'evenings' },
        summary: 'Asked about whitening.',
        isReturning: true,
      },
    });
    expect(p).not.toContain('Common questions');
    expect(p).not.toContain('Owner instructions');
    expect(p).not.toContain('## Skills');
    expect(p).toContain('Name: Rahul');
    expect(p).toContain('preferred_time: evenings');
    expect(p).toContain('Asked about whitening.');
    expect(p).toContain('returning customer');
  });

  it('respects a fixed reply language', () => {
    const p = composeSystemPrompt({ agent: { ...agent, language: 'Hindi' }, skills: [] });
    expect(p).toContain('Reply in Hindi');
  });

  it('builds the prompt from the database: enabled skills only, tools only when usable', async () => {
    const s = await signup();
    await prisma.agent.update({
      where: { userId: s.userId },
      data: { businessDetails: 'We sell sarees in Jaipur.' },
    });
    const faq = await prisma.skill.findUniqueOrThrow({ where: { slug: 'faq-bot' } });
    const email = await prisma.skill.findUniqueOrThrow({ where: { slug: 'email-followup' } });
    await prisma.userSkill.deleteMany({ where: { userId: s.userId } });
    await prisma.userSkill.create({ data: { userId: s.userId, skillId: faq.id, enabled: true } });
    await prisma.userSkill.create({ data: { userId: s.userId, skillId: email.id, enabled: false } });

    const { system, tools } = await buildAgentPrompt(s.userId, { channel: 'Telegram' });
    expect(system).toContain('We sell sarees in Jaipur.');
    expect(system).toContain('FAQ Bot');
    expect(system).not.toContain('Email Follow-up');
    expect(tools).toHaveLength(0);

    // enabling a skill that needs Gmail still exposes no send_email tool until Gmail is connected
    await prisma.userSkill.updateMany({
      where: { userId: s.userId, skillId: email.id },
      data: { enabled: true },
    });
    const again = await buildAgentPrompt(s.userId, { channel: 'Telegram' });
    expect(again.system).toContain('Email Follow-up');
    expect(again.tools.map((t) => t.name)).not.toContain('send_email');
  });
});

describe('provider adapters', () => {
  const transcript = {
    provider: 'anthropic' as const,
    model: 'claude-haiku-5-5',
    apiKey: 'x',
    messages: [
      { role: 'system' as const, content: 'sys' },
      { role: 'user' as const, content: 'book me' },
      {
        role: 'assistant' as const,
        content: null,
        toolCalls: [
          { id: 't1', name: 'book_appointment', arguments: { a: 1 } },
          { id: 't2', name: 'capture_lead', arguments: { b: 2 } },
        ],
      },
      { role: 'tool' as const, toolCallId: 't1', name: 'book_appointment', content: '{"ok":true}' },
      { role: 'tool' as const, toolCallId: 't2', name: 'capture_lead', content: '{"ok":true}' },
    ],
  };

  it('Anthropic: system is separate and consecutive tool results merge into one user turn', () => {
    const { system, messages } = toAnthropic(transcript);
    expect(system).toBe('sys');
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[1]!.content.filter((b) => b.type === 'tool_use')).toHaveLength(2);
    expect(messages[2]!.content.every((b) => b.type === 'tool_result')).toBe(true);
  });

  it('Gemini: roles map to user/model and tool results become functionResponse parts', () => {
    const { system, contents } = toGemini({ ...transcript, provider: 'google', model: 'gemini-2.5-flash' });
    expect(system).toBe('sys');
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(JSON.stringify(contents[2])).toContain('functionResponse');
  });

  it('Gemini: strips unsupported JSON schema keys', () => {
    expect(
      cleanSchema({
        type: 'object',
        additionalProperties: false,
        properties: { a: { type: 'string', default: 'x' } },
      }),
    ).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
  });
});
