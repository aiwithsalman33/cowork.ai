import type { ToolName, Toolkit } from '@cowork/shared';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import type { ToolDef } from '../llm/types.js';
import {
  appendSheetRow,
  createCalendarEvent,
  extractDocText,
  readDoc,
  readSheet,
  searchDrive,
  sendGmail,
} from '../integrations/google.js';
import { logEvent } from '../services/audit.js';

export interface SheetRef {
  id: string;
  name: string;
  description: string;
  purpose: 'LEADS' | 'LOOKUP';
  spreadsheetId: string;
  tab: string | null;
}

export interface ToolContext {
  userId: string;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  channelLabel: string;
  timeZone: string;
  /** Google services the tenant granted (gmail, googlecalendar, …) */
  google: Set<Toolkit>;
  googleSettings: { calendarId?: string };
  sheets: SheetRef[];
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
  read_sheet: {
    name: 'read_sheet',
    description:
      "Look up live data in one of the business's Google Sheets (see the 'Google Sheets' section of your instructions). Returns the header row plus matching rows.",
    parameters: {
      type: 'object',
      properties: {
        sheet_name: { type: 'string', description: 'Exact sheet name from your instructions' },
        query: {
          type: 'string',
          description: 'Words to match in rows (e.g. a product name). Leave empty to get the first rows.',
        },
      },
      required: ['sheet_name'],
    },
  },
};

/** Which Google service a tool needs (null = works without Google). */
const REQUIRES: Record<ToolName, Toolkit | null> = {
  book_appointment: null,
  capture_lead: null,
  send_email: 'gmail',
  search_drive: 'googledrive',
  read_doc: 'googledocs',
  read_sheet: 'googlesheets',
};

export function availableTools(
  requested: Set<ToolName>,
  ctx: Pick<ToolContext, 'google' | 'sheets'>,
): ToolName[] {
  const tools = new Set(requested);
  // Lookup sheets are always usable once added in Agent Config — no skill needed.
  if (ctx.sheets.some((s) => s.purpose === 'LOOKUP')) tools.add('read_sheet');
  return [...tools].filter((t) => {
    const need = REQUIRES[t];
    if (t === 'read_sheet' && !ctx.sheets.some((s) => s.purpose === 'LOOKUP')) return false;
    return !need || ctx.google.has(need);
  });
}

const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v);

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
  if (ctx.google.has('googlecalendar')) {
    try {
      const ev = await createCalendarEvent(ctx.userId, {
        calendarId: ctx.googleSettings.calendarId,
        title: `${service} — ${name}`,
        description: [
          `Booked by AI via ${ctx.channelLabel}`,
          phone && `Phone: ${phone}`,
          email && `Email: ${email}`,
          str(args.notes),
        ]
          .filter(Boolean)
          .join('\n'),
        start,
        end,
        timeZone: ctx.timeZone,
        attendeeEmail: email,
      });
      calendar = 'added';
      await prisma.appointment.update({ where: { id: appt.id }, data: { googleEventId: ev.id } });
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
  const leadSheet = ctx.sheets.find((s) => s.purpose === 'LEADS');
  let sheet: 'added' | 'no_sheet' | 'failed' = 'no_sheet';
  if (leadSheet && ctx.google.has('googlesheets')) {
    try {
      await appendSheetRow(ctx.userId, leadSheet.spreadsheetId, leadSheet.tab, [
        new Date().toLocaleString('en-IN', { timeZone: ctx.timeZone }),
        lead.name,
        lead.phone ?? '',
        lead.email ?? '',
        lead.interest ?? '',
        lead.notes ?? '',
        ctx.channelLabel,
      ]);
      sheet = 'added';
      await prisma.lead.update({ where: { id: lead.id }, data: { syncedToSheet: true } });
    } catch (err) {
      sheet = 'failed';
      await logEvent(
        ctx.userId,
        'WARN',
        'tool.sheets_failed',
        `Google Sheets (${leadSheet.name}): ${(err as Error).message}`,
      );
    }
  }
  return { ok: true, lead_id: lead.id, google_sheet: sheet };
}

async function sendEmail(args: Record<string, unknown>, ctx: ToolContext) {
  const to = str(args.to);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: 'Invalid email address' };
  await sendGmail(ctx.userId, to, str(args.subject).slice(0, 200), str(args.body).slice(0, 5000));
  return { ok: true, sent_to: to };
}

async function driveSearch(args: Record<string, unknown>, ctx: ToolContext) {
  const files = await searchDrive(ctx.userId, str(args.query).slice(0, 100));
  return { ok: true, files: files.map((f) => ({ id: f.id, name: f.name, type: f.mimeType })) };
}

async function docRead(args: Record<string, unknown>, ctx: ToolContext) {
  const text = extractDocText(await readDoc(ctx.userId, str(args.document_id)));
  return { ok: true, text: text || '(document is empty or not a Google Doc)' };
}

/** Returns header + up to 25 rows containing every query word (case-insensitive). */
export function filterRows(rows: string[][], query: string, limit = 25) {
  const [header = [], ...data] = rows;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length
    ? data.filter((r) => {
        const line = r.join(' ').toLowerCase();
        return words.every((w) => line.includes(w));
      })
    : data;
  return { header, rows: matches.slice(0, limit), total_matches: matches.length };
}

async function sheetRead(args: Record<string, unknown>, ctx: ToolContext) {
  const wanted = str(args.sheet_name).toLowerCase();
  const sheet = ctx.sheets.find((s) => s.purpose === 'LOOKUP' && s.name.toLowerCase() === wanted);
  if (!sheet) {
    return {
      ok: false,
      error: `Unknown sheet. Available: ${ctx.sheets
        .filter((s) => s.purpose === 'LOOKUP')
        .map((s) => s.name)
        .join(', ')}`,
    };
  }
  const rows = await readSheet(ctx.userId, sheet.spreadsheetId, sheet.tab, 1000);
  return { ok: true, sheet: sheet.name, ...filterRows(rows, str(args.query)) };
}

const EXECUTORS: Record<
  ToolName,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>
> = {
  book_appointment: bookAppointment,
  capture_lead: captureLead,
  send_email: sendEmail,
  search_drive: driveSearch,
  read_doc: docRead,
  read_sheet: sheetRead,
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
