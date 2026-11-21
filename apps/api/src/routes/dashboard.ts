import type { FastifyInstance } from 'fastify';
import { IMPACT, type DashboardDTO } from '@partner/shared';
import { authenticate, user } from '../plugins/auth.js';
import { isPlanActive, limitsFor, messagesThisMonth } from '../services/plan.js';
import { toChannelDTO, toConversationDTO } from '../services/dto.js';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/dashboard', async (req): Promise<DashboardDTO> => {
    const db = req.db;
    const u = user(req);
    const today = startOfToday();

    const [
      agent,
      keyCount,
      channels,
      totalMessages,
      userMessages,
      botReplies,
      messagesToday,
      conversationsToday,
      uniqueUsers,
      newUsersToday,
      tokens,
      recent,
      skills,
      monthUsed,
    ] = await Promise.all([
      db.agent.findFirst(),
      db.apiKey.count(),
      db.channel.findMany({ orderBy: { createdAt: 'asc' } }),
      db.message.count({ where: { role: { not: 'SYSTEM' } } }),
      db.message.count({ where: { direction: 'IN' } }),
      db.message.count({ where: { direction: 'OUT', role: 'ASSISTANT' } }),
      db.message.count({ where: { createdAt: { gte: today }, role: { not: 'SYSTEM' } } }),
      db.conversation.count({ where: { lastMessageAt: { gte: today } } }),
      db.contact.count(),
      db.contact.count({ where: { firstSeenAt: { gte: today } } }),
      db.message.aggregate({ _sum: { tokensIn: true, tokensOut: true } }),
      db.conversation.findMany({
        orderBy: { lastMessageAt: 'desc' },
        take: 5,
        include: { contact: true, channel: true },
      }),
      db.userSkill.findMany({ where: { enabled: true }, include: { skill: true }, take: 50 }),
      messagesThisMonth(u.id),
    ]);

    const planActive = isPlanActive(u);
    const connected = channels.some((c) => c.status === 'CONNECTED');
    const minutesSaved = botReplies * IMPACT.minutesSavedPerReply;
    const userMsgsReplied = userMessages === 0 ? 0 : Math.min(100, Math.round((botReplies / userMessages) * 100));

    return {
      impact: {
        messagesHandled: botReplies,
        minutesSaved,
        moneySavedInr: Math.round((minutesSaved / 60) * IMPACT.hourlyCostInr),
        tokensUsed: (tokens._sum.tokensIn ?? 0) + (tokens._sum.tokensOut ?? 0),
        availability: planActive && agent?.isActive && connected ? '24/7' : planActive && agent?.isActive ? 'Not connected' : 'Paused',
      },
      stats: {
        messagesToday,
        conversationsToday,
        newUsersToday,
        replyRate: userMsgsReplied,
        totalMessages,
        uniqueUsers,
        userMessages,
        botReplies,
      },
      checklist: {
        customized: !!agent?.customized,
        aiKey: keyCount > 0 && !!agent?.provider,
        channel: connected,
        testMessage: userMessages > 0,
      },
      recentConversations: recent.map(toConversationDTO),
      activeSkills: skills.map((s) => ({ slug: s.skill.slug, name: s.skill.name, icon: s.skill.icon })),
      channels: channels.map(toChannelDTO),
      agent: {
        name: agent?.name ?? 'Assistant',
        isActive: agent?.isActive ?? true,
        provider: agent?.provider ?? null,
        model: agent?.model ?? null,
        planActive,
      },
      usage: { messagesThisMonth: monthUsed, messageLimit: limitsFor(u).messagesPerMonth },
    };
  });
}
