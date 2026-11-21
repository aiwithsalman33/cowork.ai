import type { ToolName, Toolkit } from '@partner/shared';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import type { ToolDef } from '../llm/types.js';
import { executeTool, isToolkitConfigured } from '../integrations/composio.js';
import { COMPOSIO_TOOLS, extractDocText } from '../integrations/composio-tools.js';
import { logEvent } from '../services/audit.js';

export interface ToolContext {
  userId: string;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  channelLabel: string;
  timeZone: string;
  /** toolkit → { connectedAccountId, settings } for CONNECTED integrations */
  integrations: Map<
    Toolkit,
    { connectedAccountId: string | null; settings: Record<string, string | undefined> }
  >;
}

export const TOOL_DEFS: Record<ToolName, ToolDef> = {
  book_appointment: {
    name: 'book_appointment',
    description:
      'Book an appointment for the customer. Call only after confirming service, date/time, name and phone with the customer.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Customer full name' },
        customer_phone: { type: 'string', description: 'Customer phone number, if known' },
        customer_email: { type: 'string', description: 'Customer email, if given' },
        service: {
          type: 'string',
          description: 'What the appointment is for, e.g. "Haircut" or "Site visit"',
        },
        start_time: {
          type: 'string',
          description: 'Start time in ISO 8601 with timezone offset, e.g. 2026-11-22T17:30:00+05:30',
        },
        duration_minutes: { type: 'number', description: 'Length in minutes (default 30)' },
        notes: { type: 'string', description: 'Anything else the business should know' },
      },
      required: ['customer_name', 'service', 'start_time'],
    },
  },
  capture_lead: {
    name: 'capture_lead',
    description:
      "Save a potential customer's details or a customer request (order, complaint, return) for the business.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        interest: {
          type: 'string',
          description: 'What they want, e.g. "3BHK in Whitefield" or "Return request: order #123"',
        },
        notes: { type: 'string', description: 'Budget, timeline, or other useful details' },
      },
      required: ['name', 'interest'],
    },
  },
  send_email: {
    name: 'send_email',
    description: 'Send an email to the customer from the business Gmail account.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string' },
        body: {
          type: 'string',
          description: 'Plain-text email body, polite and concise, signed with the business name',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  search_drive: {
    name: 'search_drive',
    description: "Search the business's Google Drive for documents relevant to the customer's question.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Keywords to search for' } },
      required: ['query'],
    },
  },
  read_doc: {
    name: 'read_doc',
    description: 'Read the text of a Google Doc found with search_drive.',
    parameters: {
      type: 'object',
      properties: { document_id: { type: 'string', description: 'The file id returned by search_drive' } },
      required: ['document_id'],
    },
  },
};

/** Which toolkit a tool needs (null = works without any integration). */
const REQUIRES: Record<ToolName, Toolkit | null> = {
  book_appointment: null,
  capture_lead: null,
  send_email: 'gmail',
  search_drive: 'googledrive',
  read_doc: 'googledocs',
};

export function availableTools(requested: Set<ToolName>, ctx: Pick<ToolContext, 'integrations'>): ToolName[] {
  return [...requested].filter((t) => {
    const need = REQUIRES[t];
    return !need || (ctx.integrations.has(need) && isToolkitConfigured(need));
  });
}

const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v);

function findId(data: Record<string, unknown>): string | null {
  const candidates = [
    data.id,
    (data.response_data as Record<string, unknown> | undefined)?.id,
    (data.event as Record<string, unknown> | undefined)?.id,
  ];
  const found = candidates.find((c) => typeof c === 'string');
  return (found as string | undefined) ?? null;
}

async function bookAppointment(args: Record<string, unknown>, ctx: ToolContext) {
  const start = new Date(str(args.start_time));
  if (Number.isNaN(start.getTime()))
    return { ok: false, error: 'start_time must be a valid ISO 8601 date-time' };
  if (start.getTime() < Date.now() - 5 * 60_000)
    return { ok: false, error: 'That time is in the past. Ask for a future time.' };
  const duration = Math.min(Math.max(Number(args.duration_minutes) || 30, 5), 8 * 60);
  const end = new Date(start.getTime() + duration * 60_000);
  const name = str(args.customer_name) || ctx.contactName || 'Customer';
  const phone = str(args.customer_phone) || ctx.contactPhone || null;
  const email = str(args.customer_email) || null;
  const service = str(args.service) || 'Appointment';

  const appt = await prisma.appointment.create({
    data: {
      userId: ctx.userId,
      contactId: ctx.contactId,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      title: service,
      notes: str(args.notes) || null,
      startsAt: start,
      endsAt: end,
    },
  });

  let calendar: 'added' | 'not_connected' | 'failed' = 'not_connected';
  const cal = ctx.integrations.get('googlecalendar');
  if (cal && isToolkitConfigured('googlecalendar')) {
    try {
      const res = await executeTool(
        ctx.userId,
        COMPOSIO_TOOLS.createEvent.slug,
        COMPOSIO_TOOLS.createEvent.args({
          startIso: start.toISOString(),
          durationMinutes: duration,
          title: `${service} — ${name}`,
          description: [
            `Booked by AI via ${ctx.channelLabel}`,
            phone && `Phone: ${phone}`,
            email && `Email: ${email}`,
            str(args.notes),
          ]
            .filter(Boolean)
            .join('\n'),
          attendeeEmail: email,
          timeZone: ctx.timeZone,
          calendarId: cal.settings.calendarId,
        }),
        cal.connectedAccountId,
      );
      if (res.ok) {
        calendar = 'added';
        const eventId = findId(res.data);
        if (eventId)
          await prisma.appointment.update({ where: { id: appt.id }, data: { googleEventId: eventId } });
      } else {
        calendar = 'failed';
        await logEvent(
          ctx.userId,
          'WARN',
          'tool.calendar_failed',
          `Google Calendar: ${res.error ?? 'unknown error'}`,
        );
      }
    } catch (err) {
      calendar = 'failed';
      await logEvent(
        ctx.userId,
        'WARN',
        'tool.calendar_failed',
        `Google Calendar: ${(err as Error).message}`,
      );
    }
  }
  return {
    ok: true,
    appointment_id: appt.id,
    when: start.toLocaleString('en-IN', { timeZone: ctx.timeZone, dateStyle: 'full', timeStyle: 'short' }),
    duration_minutes: duration,
    google_calendar: calendar,
  };
}

async function captureLead(args: Record<string, unknown>, ctx: ToolContext) {
  const lead = await prisma.lead.create({
    data: {
      userId: ctx.userId,
      contactId: ctx.contactId,
      name: str(args.name) || ctx.contactName || 'Unknown',
      phone: str(args.phone) || ctx.contactPhone || null,
      email: str(args.email) || null,
      interest: str(args.interest) || null,
      notes: str(args.notes) || null,
    },
  });
  let sheet: 'added' | 'not_connected' | 'no_sheet' | 'failed' = 'not_connected';
  const gs = ctx.integrations.get('googlesheets');
  if (gs && isToolkitConfigured('googlesheets')) {
    if (!gs.settings.sheetId) sheet = 'no_sheet';
    else {
      try {
        const res = await executeTool(
          ctx.userId,
          COMPOSIO_TOOLS.appendRow.slug,
          COMPOSIO_TOOLS.appendRow.args({
            spreadsheetId: gs.settings.sheetId,
            values: [
              new Date().toLocaleString('en-IN', { timeZone: ctx.timeZone }),
              lead.name,
              lead.phone ?? '',
              lead.email ?? '',
              lead.interest ?? '',
              lead.notes ?? '',
              ctx.channelLabel,
            ],
          }),
          gs.connectedAccountId,
        );
        sheet = res.ok ? 'added' : 'failed';
        if (res.ok) await prisma.lead.update({ where: { id: lead.id }, data: { syncedToSheet: true } });
        else
          await logEvent(
            ctx.userId,
            'WARN',
            'tool.sheets_failed',
            `Google Sheets: ${res.error ?? 'unknown error'}`,
          );
      } catch (err) {
        sheet = 'failed';
        await logEvent(ctx.userId, 'WARN', 'tool.sheets_failed', `Google Sheets: ${(err as Error).message}`);
      }
    }
  }
  return { ok: true, lead_id: lead.id, google_sheets: sheet };
}

async function sendEmail(args: Record<string, unknown>, ctx: ToolContext) {
  const to = str(args.to);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: 'Invalid email address' };
  const gm = ctx.integrations.get('gmail');
  if (!gm) return { ok: false, error: 'Gmail is not connected' };
  const res = await executeTool(
    ctx.userId,
    COMPOSIO_TOOLS.sendEmail.slug,
    COMPOSIO_TOOLS.sendEmail.args({
      to,
      subject: str(args.subject).slice(0, 200),
      body: str(args.body).slice(0, 5000),
    }),
    gm.connectedAccountId,
  );
  return res.ok ? { ok: true, sent_to: to } : { ok: false, error: res.error ?? 'Email failed' };
}

async function searchDrive(args: Record<string, unknown>, ctx: ToolContext) {
  const gd = ctx.integrations.get('googledrive');
  if (!gd) return { ok: false, error: 'Google Drive is not connected' };
  const res = await executeTool(
    ctx.userId,
    COMPOSIO_TOOLS.searchDrive.slug,
    COMPOSIO_TOOLS.searchDrive.args({ query: str(args.query).slice(0, 100) }),
    gd.connectedAccountId,
  );
  if (!res.ok) return { ok: false, error: res.error ?? 'Drive search failed' };
  const d = res.data as Record<string, unknown>;
  const files = (d.files ?? (d.response_data as Record<string, unknown> | undefined)?.files ?? []) as {
    id?: string;
    name?: string;
    mimeType?: string;
  }[];
  return { ok: true, files: files.slice(0, 5).map((f) => ({ id: f.id, name: f.name, type: f.mimeType })) };
}

async function readDoc(args: Record<string, unknown>, ctx: ToolContext) {
  const gdoc = ctx.integrations.get('googledocs');
  if (!gdoc) return { ok: false, error: 'Google Docs is not connected' };
  const res = await executeTool(
    ctx.userId,
    COMPOSIO_TOOLS.readDoc.slug,
    COMPOSIO_TOOLS.readDoc.args({ documentId: str(args.document_id) }),
    gdoc.connectedAccountId,
  );
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not read document' };
  const text = extractDocText(res.data);
  return { ok: true, text: text || '(document is empty or not a Google Doc)' };
}

const EXECUTORS: Record<
  ToolName,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>
> = {
  book_appointment: bookAppointment,
  capture_lead: captureLead,
  send_email: sendEmail,
  search_drive: searchDrive,
  read_doc: readDoc,
};

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  const exec = EXECUTORS[name as ToolName];
  if (!exec) return { ok: false, error: `Unknown tool ${name}` };
  try {
    return await exec(args, ctx);
  } catch (err) {
    logger.warn({ err: (err as Error).message, tool: name, userId: ctx.userId }, 'tool failed');
    await logEvent(ctx.userId, 'ERROR', 'tool.error', `${name} failed: ${(err as Error).message}`);
    return { ok: false, error: 'The action failed. Apologise and say the team will follow up.' };
  }
}
