import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  SKILL_CATEGORIES,
  TOOL_NAMES,
  skillGenerateSchema,
  skillToggleSchema,
  skillUpsertSchema,
  type SkillDTO,
  type SkillCategory,
  type ToolName,
} from '@cowork/shared';
import type { Skill } from '@prisma/client';
import { authenticate, user } from '../plugins/auth.js';
import { parse } from '../lib/validate.js';
import { badRequest, HttpError, notFound } from '../lib/errors.js';
import { randomToken } from '../lib/crypto.js';
import { prisma } from '../db/client.js';
import { assertCanEnableSkill } from '../services/plan.js';
import { resolveModel } from '../agent/keys.js';
import { complete, LLMError } from '../llm/index.js';

export function toSkillDTO(s: Skill, enabled: boolean, includePrompt = false): SkillDTO {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    category: s.category as SkillCategory,
    icon: s.icon,
    tools: s.tools as ToolName[],
    isPublic: s.isPublic,
    isCustom: !s.isBuiltin,
    enabled,
    ...(includePrompt ? { promptFragment: s.promptFragment } : {}),
  };
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'skill'
  );
}

const SKILL_GENERATOR_PROMPT = `You design "skills" for a customer-facing WhatsApp/Telegram AI assistant used by small businesses.
Given the owner's description, return ONLY a JSON object with these keys:
- "name": short title (2-4 words)
- "description": one sentence describing what the skill does, for the owner
- "category": one of ${JSON.stringify(SKILL_CATEGORIES.filter((c) => c !== 'Custom'))}
- "icon": a lucide icon name in kebab-case (e.g. "calendar-check", "gift", "truck", "heart-handshake")
- "promptFragment": 2-5 sentences of precise instructions to the assistant, written in the second person ("When a customer…, you…"). Be specific about what to ask, what to say, and what not to do. Never invent prices or policies — tell the assistant to use the knowledge base.
- "tools": array (possibly empty) chosen ONLY from ${JSON.stringify(TOOL_NAMES)} — include a tool only if the skill clearly needs it (book_appointment for bookings, capture_lead to record customer details/requests, send_email for emailing customers, search_drive/read_doc for looking up documents).`;

export async function skillRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/skills', async (req) => {
    const u = user(req);
    const [skills, mine] = await Promise.all([
      prisma.skill.findMany({
        where: { OR: [{ isPublic: true }, { authorId: u.id }] },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      req.db.userSkill.findMany(),
    ]);
    const enabled = new Map(mine.map((m) => [m.skillId, m.enabled]));
    return { skills: skills.map((s) => toSkillDTO(s, enabled.get(s.id) ?? false, s.authorId === u.id)) };
  });

  app.put('/skills/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    const { enabled } = parse(skillToggleSchema, req.body);
    const u = user(req);
    const skill = await prisma.skill.findFirst({
      where: { id, OR: [{ isPublic: true }, { authorId: u.id }] },
    });
    if (!skill) throw notFound('Skill not found');
    const current = await req.db.userSkill.findFirst({ where: { skillId: id } });
    if (enabled && !current?.enabled) await assertCanEnableSkill(u);
    if (current) await req.db.userSkill.update({ where: { id: current.id }, data: { enabled } });
    else await req.db.userSkill.create({ data: { skillId: id, enabled } as never });
    return { skill: toSkillDTO(skill, enabled) };
  });

  /** AI Skill Creator: turns a plain-language description into a draft skill (not saved). */
  app.post(
    '/skills/generate',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { description } = parse(skillGenerateSchema, req.body);
      const model = await resolveModel(user(req).id);
      if (!model) throw badRequest('Add an AI key in Agent Config → API Keys to use the Skill Creator.');
      let raw: string | null;
      try {
        const res = await complete({
          ...model,
          messages: [
            { role: 'system', content: SKILL_GENERATOR_PROMPT },
            { role: 'user', content: description },
          ],
          temperature: 0.4,
          maxTokens: 800,
          json: true,
        });
        raw = res.content;
      } catch (err) {
        req.log.warn({ err: (err as Error).message }, 'skill generation failed');
        throw new HttpError(
          503,
          err instanceof LLMError ? err.message : 'Skill generation is unavailable right now. Try again.',
          'AI_UNAVAILABLE',
        );
      }
      const match = raw?.match(/\{[\s\S]*\}/);
      if (!match) throw badRequest('The AI did not return a valid skill. Try describing it differently.');
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(match[0]);
      } catch {
        throw badRequest('The AI returned malformed JSON. Try again.');
      }
      const draft = skillUpsertSchema.safeParse({
        slug: `${slugify(String(obj.name ?? 'skill'))}-${randomToken(3)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, 'x')}`,
        name: obj.name,
        description: obj.description,
        category: SKILL_CATEGORIES.includes(obj.category as SkillCategory) ? obj.category : 'Custom',
        icon: typeof obj.icon === 'string' ? obj.icon : 'sparkles',
        promptFragment: obj.promptFragment,
        tools: Array.isArray(obj.tools) ? obj.tools.filter((t) => TOOL_NAMES.includes(t as ToolName)) : [],
        isPublic: false,
      });
      if (!draft.success) throw badRequest('The generated skill was incomplete. Try adding more detail.');
      return { draft: draft.data };
    },
  );

  /** Save a custom skill (always private to the tenant) and enable it. */
  app.post('/skills', async (req) => {
    const input = parse(skillUpsertSchema, req.body);
    const u = user(req);
    const count = await prisma.skill.count({ where: { authorId: u.id } });
    if (count >= 50) throw badRequest('You can create up to 50 custom skills.');
    await assertCanEnableSkill(u);
    const slugTaken = await prisma.skill.findUnique({ where: { slug: input.slug } });
    const skill = await prisma.skill.create({
      data: {
        ...input,
        slug: slugTaken
          ? `${input.slug}-${randomToken(3)
              .toLowerCase()
              .replace(/[^a-z0-9]/g, 'x')}`
          : input.slug,
        isPublic: false,
        isBuiltin: false,
        authorId: u.id,
      },
    });
    await req.db.userSkill.create({ data: { skillId: skill.id, enabled: true } as never });
    return { skill: toSkillDTO(skill, true, true) };
  });

  app.delete('/skills/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    const skill = await prisma.skill.findUnique({ where: { id } });
    if (!skill) throw notFound('Skill not found');
    // someone else's skill looks the same as a missing one (M12)
    if (skill.authorId !== user(req).id) throw notFound('Skill not found');
    await prisma.skill.delete({ where: { id } });
    return { ok: true };
  });
}
