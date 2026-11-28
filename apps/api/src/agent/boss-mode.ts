/**
 * Boss Mode — the business owner messages their own agent from a whitelisted number.
 * Deterministic commands first; anything else is interpreted by the tenant's model (if a key is set).
 */
import { prisma } from '../db/client.js';
import { generate } from '../llm/gateway.js';
import { resolveModel } from './keys.js';
import { logEvent } from '../services/audit.js';
import { isFlagEnabled } from '../services/flags.js';

const HELP = `👔 Boss Mode commands
• stats — today's numbers
• info: <text> — add to Business details
• product: <text> — add to Products & services
• faq: <question> | <answer> — add a common question
• leads — latest leads
• appointments — upcoming bookings
• pause / resume — stop or start customer replies
Or just tell me in plain words, e.g. "we're closed on Monday for Diwali".`;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function appendKb(
  userId: string,
  field: 'businessDetails' | 'productsServices' | 'commonQuestions',
  text: string,
) {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { userId } });
  const current = agent[field].trim();
  await prisma.agent.update({ where: { userId }, data: { [field]: current ? `${current}\n${text}` : text } });
  await logEvent(userId, 'INFO', 'boss.kb_updated', `Boss Mode updated ${field}: ${text.slice(0, 120)}`);
}

async function stats(userId: string) {
  const today = startOfToday();
  const [msgs, replies, convos, newContacts, appts, leads] = await Promise.all([
    prisma.message.count({ where: { userId, direction: 'IN', createdAt: { gte: today } } }),
    prisma.message.count({
      where: { userId, direction: 'OUT', role: 'ASSISTANT', createdAt: { gte: today } },
    }),
    prisma.conversation.count({ where: { userId, lastMessageAt: { gte: today } } }),
    prisma.contact.count({ where: { userId, firstSeenAt: { gte: today } } }),
    prisma.appointment.count({ where: { userId, createdAt: { gte: today } } }),
    prisma.lead.count({ where: { userId, createdAt: { gte: today } } }),
  ]);
  return `📊 Today so far
• ${msgs} customer messages, ${replies} AI replies
• ${convos} conversations, ${newContacts} new customers
• ${appts} appointments booked, ${leads} leads captured`;
}

async function interpret(userId: string, text: string): Promise<string> {
  const model = await resolveModel(userId);
  if (!model) return `I didn't understand that. ${HELP}`;
  const res = await generate(
    { userId, feature: 'boss', promptVersion: 'boss@1' },
    {
      ...model,
      json: true,
      maxTokens: 400,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You route a business owner\'s instruction to their AI assistant\'s knowledge base. Return ONLY JSON: {"action":"business"|"products"|"faq"|"stats"|"unknown","text":string,"question":string,"answer":string}. ' +
            'Use "business" for hours, location, policies, holidays, announcements; "products" for items, prices, offers; "faq" when they give a question and answer. Rewrite "text" as a clear third-person fact for customers.',
        },
        { role: 'user', content: text },
      ],
    },
  );
  let parsed: { action?: string; text?: string; question?: string; answer?: string } = {};
  try {
    parsed = JSON.parse(res.content?.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  } catch {
    /* fall through */
  }
  switch (parsed.action) {
    case 'business':
      if (!parsed.text) break;
      await appendKb(userId, 'businessDetails', parsed.text);
      return `✅ Added to Business details:\n"${parsed.text}"`;
    case 'products':
      if (!parsed.text) break;
      await appendKb(userId, 'productsServices', parsed.text);
      return `✅ Added to Products & services:\n"${parsed.text}"`;
    case 'faq':
      if (!parsed.question || !parsed.answer) break;
      await appendKb(userId, 'commonQuestions', `Q: ${parsed.question}\nA: ${parsed.answer}`);
      return `✅ Added FAQ:\nQ: ${parsed.question}\nA: ${parsed.answer}`;
    case 'stats':
      return stats(userId);
  }
  return `I couldn't tell what to change. ${HELP}`;
}

export async function handleBossMessage(userId: string, raw: string): Promise<string> {
  if (!(await isFlagEnabled('boss_mode', userId))) return 'Boss Mode is currently disabled.';
  const text = raw.trim();
  const lower = text.toLowerCase();
  const after = (prefix: string) => text.slice(prefix.length).trim();

  if (['help', '/help', 'menu', '/start'].includes(lower)) return HELP;
  if (['stats', '/stats', 'today', 'report'].includes(lower)) return stats(userId);
  if (lower === 'pause' || lower === 'resume') {
    await prisma.agent.update({ where: { userId }, data: { isActive: lower === 'resume' } });
    return lower === 'pause' ? '⏸️ Agent paused. Customers will not get AI replies.' : '▶️ Agent resumed.';
  }
  if (lower === 'leads') {
    const leads = await prisma.lead.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 });
    if (!leads.length) return 'No leads yet.';
    return `🧲 Latest leads\n${leads.map((l) => `• ${l.name}${l.phone ? ` (${l.phone})` : ''} — ${l.interest ?? ''}`).join('\n')}`;
  }
  if (lower === 'appointments') {
    const appts = await prisma.appointment.findMany({
      where: { userId, startsAt: { gte: new Date() }, status: 'CONFIRMED' },
      orderBy: { startsAt: 'asc' },
      take: 5,
    });
    if (!appts.length) return 'No upcoming appointments.';
    return `📅 Upcoming\n${appts
      .map(
        (a) =>
          `• ${a.startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} — ${a.title}, ${a.customerName}`,
      )
      .join('\n')}`;
  }
  for (const [prefix, field, label] of [
    ['info:', 'businessDetails', 'Business details'],
    ['product:', 'productsServices', 'Products & services'],
  ] as const) {
    if (lower.startsWith(prefix)) {
      const value = after(prefix);
      if (!value) return `Usage: ${prefix} <text>`;
      await appendKb(userId, field, value);
      return `✅ Added to ${label}.`;
    }
  }
  if (lower.startsWith('faq:')) {
    const [q, a] = after('faq:')
      .split('|')
      .map((s) => s.trim());
    if (!q || !a) return 'Usage: faq: <question> | <answer>';
    await appendKb(userId, 'commonQuestions', `Q: ${q}\nA: ${a}`);
    return '✅ FAQ added.';
  }
  return interpret(userId, text);
}
