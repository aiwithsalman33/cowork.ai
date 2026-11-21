/**
 * Composio tool slugs + argument builders used by the agent's tools.
 *
 * VERIFICATION STATUS (checked 2026-11-21):
 *  - GMAIL_SEND_EMAIL — slug confirmed in @composio/core 0.31 docs; argument names are from Composio's
 *    public catalogue and NOT verified against the live schema.
 *  - The Calendar / Sheets / Drive / Docs slugs and arguments could NOT be verified from the SDK package.
 *
 * Use Admin → Overview → "Verify Composio tools" (GET /api/admin/composio/verify) to fetch each
 * tool's live input schema and fix anything here if Composio has renamed a field.
 */
export const COMPOSIO_TOOLS = {
  sendEmail: {
    toolkit: 'gmail',
    slug: 'GMAIL_SEND_EMAIL',
    args: (a: { to: string; subject: string; body: string }) => ({
      recipient_email: a.to,
      subject: a.subject,
      body: a.body,
    }),
  },
  createEvent: {
    toolkit: 'googlecalendar',
    slug: 'GOOGLECALENDAR_CREATE_EVENT',
    args: (a: {
      startIso: string;
      durationMinutes: number;
      title: string;
      description: string;
      attendeeEmail?: string | null;
      timeZone: string;
      calendarId?: string;
    }) => ({
      calendar_id: a.calendarId || 'primary',
      start_datetime: a.startIso,
      event_duration_hour: Math.floor(a.durationMinutes / 60),
      event_duration_minutes: a.durationMinutes % 60,
      summary: a.title,
      description: a.description,
      timezone: a.timeZone,
      ...(a.attendeeEmail ? { attendees: [a.attendeeEmail] } : {}),
    }),
  },
  appendRow: {
    toolkit: 'googlesheets',
    slug: 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND',
    args: (a: { spreadsheetId: string; values: string[] }) => ({
      spreadsheetId: a.spreadsheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      values: [a.values],
    }),
  },
  searchDrive: {
    toolkit: 'googledrive',
    slug: 'GOOGLEDRIVE_FIND_FILE',
    args: (a: { query: string }) => ({
      q: `fullText contains '${a.query.replace(/['\\]/g, ' ')}' and trashed = false`,
      pageSize: 5,
    }),
  },
  readDoc: {
    toolkit: 'googledocs',
    slug: 'GOOGLEDOCS_GET_DOCUMENT_BY_ID',
    args: (a: { documentId: string }) => ({ id: a.documentId }),
  },
} as const;

export const ALL_COMPOSIO_SLUGS = Object.values(COMPOSIO_TOOLS).map((t) => t.slug);

/** Pulls readable text out of a Google Docs API document JSON (body.content[].paragraph.elements[].textRun). */
export function extractDocText(data: unknown, max = 6000): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (out.join('').length > max) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (o.textRun && typeof (o.textRun as Record<string, unknown>).content === 'string') {
        out.push((o.textRun as { content: string }).content);
      }
      for (const v of Object.values(o)) if (typeof v === 'object') walk(v);
    }
  };
  walk(data);
  return out.join('').slice(0, max).trim();
}
