/**
 * Lets the AI bot send approved WhatsApp Business API templates (Growth plan, WHATSAPP_CLOUD channels).
 * The tool is added to the agent only when the channel has approved templates marked "Use in AI bot".
 */
import type { Channel, User } from '@prisma/client';
import { PLANS } from '@cowork/shared';
import { prisma } from '../db/client.js';
import type { ToolDef } from '../llm/types.js';
import { cloudConfig } from '../channels/index.js';
import * as cloud from '../channels/whatsapp-cloud.js';
import { logEvent } from '../services/audit.js';

export const TEMPLATE_TOOL = 'send_whatsapp_template';

export interface TemplateTool {
  def: ToolDef;
  promptNote: string;
  run: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export async function buildTemplateTool(params: {
  channel: Channel;
  plan: User['plan'];
  conversationId: string;
  to: string;
}): Promise<TemplateTool | null> {
  const { channel } = params;
  if (channel.type !== 'WHATSAPP_CLOUD' || !PLANS[params.plan].limits.templates) return null;
  const templates = await prisma.whatsAppTemplate.findMany({
    where: { channelId: channel.id, status: 'APPROVED', useInAi: true },
    orderBy: { name: 'asc' },
    take: 30,
  });
  if (!templates.length) return null;

  const list = templates
    .map(
      (t) =>
        `- ${t.name} (${t.language})${t.aiHint ? ` — use when: ${t.aiHint}` : ''}; ${t.variables} parameter(s); text: "${t.body.slice(0, 160)}"`,
    )
    .join('\n');

  return {
    promptNote: `WhatsApp templates you can send with the ${TEMPLATE_TOOL} tool when one fits better than a plain reply (e.g. brochures, offers, order updates). Fill every {{n}} parameter in order. After sending, add a short friendly text reply.\n${list}`,
    def: {
      name: TEMPLATE_TOOL,
      description: 'Send one of the business’s approved WhatsApp message templates to this customer.',
      parameters: {
        type: 'object',
        properties: {
          template_name: { type: 'string', enum: templates.map((t) => t.name) },
          parameters: {
            type: 'array',
            items: { type: 'string' },
            description: 'Values for {{1}}, {{2}}, … in order',
          },
        },
        required: ['template_name'],
      },
    },
    run: async (args) => {
      const t = templates.find((x) => x.name === String(args.template_name ?? ''));
      if (!t)
        return {
          ok: false,
          error: `Unknown template. Available: ${templates.map((x) => x.name).join(', ')}`,
        };
      const values = Array.isArray(args.parameters)
        ? args.parameters.map((v) => String(v).slice(0, 300))
        : [];
      if (values.length < t.variables) {
        return { ok: false, error: `Template ${t.name} needs ${t.variables} parameter(s).` };
      }
      const externalId = await cloud.sendTemplate(
        cloudConfig(channel),
        params.to,
        { name: t.name, language: t.language },
        values.slice(0, t.variables),
      );
      const text = `[Template: ${t.name}] ${cloud.renderTemplate(t.body, values)}`;
      await prisma.message.create({
        data: {
          userId: channel.userId,
          conversationId: params.conversationId,
          direction: 'OUT',
          role: 'ASSISTANT',
          content: text,
          status: 'SENT',
          externalId,
          processedAt: new Date(),
        },
      });
      await prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastMessageAt: new Date(), lastMessage: text.slice(0, 200), messageCount: { increment: 1 } },
      });
      await logEvent(channel.userId, 'INFO', 'tool.send_whatsapp_template', `Agent sent template ${t.name}`);
      return { ok: true, sent: t.name };
    },
  };
}
