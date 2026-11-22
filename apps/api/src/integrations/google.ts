/**
 * Google integration with each tenant's OWN Google Cloud OAuth client (client id + secret they create
 * in Google Cloud Console). Standard OAuth 2.0 web-server flow + direct Google REST APIs:
 *   auth:     https://accounts.google.com/o/oauth2/v2/auth  (access_type=offline, prompt=consent)
 *   token:    https://oauth2.googleapis.com/token
 *   revoke:   https://oauth2.googleapis.com/revoke
 *   Gmail     POST gmail/v1/users/me/messages/send           (raw RFC 2822, base64url)
 *   Calendar  POST calendar/v3/calendars/{id}/events
 *   Sheets    GET/POST sheets/v4/spreadsheets/{id}/values/{range}[:append]
 *   Drive     GET drive/v3/files?q=…
 *   Docs      GET docs/v1/documents/{id}
 */
import { SignJWT, jwtVerify } from 'jose';
import type { Toolkit } from '@cowork/shared';
import { env } from '../config.js';
import { prisma } from '../db/client.js';
import { decryptJson, decrypt, encrypt } from '../lib/crypto.js';

export const GOOGLE_SCOPES: Record<Toolkit, string> = {
  gmail: 'https://www.googleapis.com/auth/gmail.send',
  googlecalendar: 'https://www.googleapis.com/auth/calendar.events',
  googlesheets: 'https://www.googleapis.com/auth/spreadsheets',
  googledrive: 'https://www.googleapis.com/auth/drive.readonly',
  googledocs: 'https://www.googleapis.com/auth/documents.readonly',
};
const BASE_SCOPES = ['openid', 'email'];

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export class GoogleError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function redirectUri(): string {
  return `${env.WEB_ORIGIN}/api/integrations/google/callback`;
}

export function servicesFromScopes(scopes: string[]): Toolkit[] {
  return (Object.entries(GOOGLE_SCOPES) as [Toolkit, string][])
    .filter(([, s]) => scopes.includes(s))
    .map(([t]) => t);
}

// ---------- OAuth state (signed, short-lived, bound to the tenant) ----------
const stateKey = new TextEncoder().encode(`${env.JWT_SECRET}:google-oauth`);

export async function signState(userId: string): Promise<string> {
  return new SignJWT({ p: 'google' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime('10m')
    .sign(stateKey);
}

export async function verifyState(state: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(state, stateKey, { algorithms: ['HS256'] });
    return payload.p === 'google' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function buildAuthUrl(creds: GoogleCredentials, state: string, services: Toolkit[]): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: [...BASE_SCOPES, ...services.map((s) => GOOGLE_SCOPES[s])].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error)
    throw new GoogleError(
      data.error_description ?? data.error ?? `Google token error ${res.status}`,
      res.status,
    );
  return data;
}

/** Reads the email claim from the id_token returned by the token endpoint (already TLS-authenticated). */
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(creds: GoogleCredentials, code: string) {
  const t = await tokenRequest({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });
  return {
    accessToken: t.access_token,
    expiresIn: t.expires_in,
    refreshToken: t.refresh_token ?? null,
    scopes: (t.scope ?? '').split(' ').filter(Boolean),
    email: emailFromIdToken(t.id_token),
  };
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
}

// ---------- Access tokens ----------
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function cacheAccessToken(userId: string, token: string, expiresIn: number) {
  tokenCache.set(userId, { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
}

export function clearTokenCache(userId: string) {
  tokenCache.delete(userId);
}

async function accessToken(userId: string): Promise<string> {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const conn = await prisma.googleConnection.findUnique({ where: { userId } });
  const creds = decryptJson<GoogleCredentials>(conn?.encryptedCredentials);
  if (!conn?.encryptedRefreshToken || !creds) throw new GoogleError('Google is not connected', 400);
  try {
    const t = await tokenRequest({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: decrypt(conn.encryptedRefreshToken),
      grant_type: 'refresh_token',
    });
    cacheAccessToken(userId, t.access_token, t.expires_in);
    return t.access_token;
  } catch (err) {
    if (err instanceof GoogleError && (err.message.includes('invalid_grant') || err.status === 400)) {
      await prisma.googleConnection.update({
        where: { userId },
        data: {
          status: 'ERROR',
          lastError: 'Google access expired or was revoked. Reconnect your Google account.',
        },
      });
    }
    throw err;
  }
}

export async function googleFetch<T>(
  userId: string,
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = data?.error?.message ?? `Google API error ${res.status}`;
    if (res.status === 401) clearTokenCache(userId);
    throw new GoogleError(msg, res.status);
  }
  return data as T;
}

// ---------- Helpers per product ----------
export function spreadsheetIdFrom(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
  if (m) return m[1]!;
  return /^[a-zA-Z0-9-_]{20,}$/.test(input.trim()) ? input.trim() : null;
}

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export async function sheetMeta(userId: string, spreadsheetId: string) {
  const d = await googleFetch<{
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  }>(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
  );
  return {
    title: d.properties?.title ?? 'Untitled',
    tabs: (d.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean),
  };
}

export async function readSheet(
  userId: string,
  spreadsheetId: string,
  tab?: string | null,
  maxRows = 500,
): Promise<string[][]> {
  const range = encodeURIComponent(tab ? `${quoteTab(tab)}!A1:Z${maxRows}` : `A1:Z${maxRows}`);
  const d = await googleFetch<{ values?: string[][] }>(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
  );
  return d.values ?? [];
}

export async function appendSheetRow(
  userId: string,
  spreadsheetId: string,
  tab: string | null | undefined,
  row: string[],
) {
  const range = encodeURIComponent(tab ? `${quoteTab(tab)}!A1` : 'A1');
  await googleFetch(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: { values: [row] } },
  );
}

export async function sendGmail(userId: string, to: string, subject: string, body: string) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const mime = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
  return googleFetch<{ id: string }>(userId, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: { raw: Buffer.from(mime, 'utf8').toString('base64url') },
  });
}

export async function createCalendarEvent(
  userId: string,
  e: {
    calendarId?: string;
    title: string;
    description: string;
    start: Date;
    end: Date;
    timeZone: string;
    attendeeEmail?: string | null;
  },
) {
  return googleFetch<{ id: string; htmlLink?: string }>(
    userId,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(e.calendarId || 'primary')}/events`,
    {
      method: 'POST',
      body: {
        summary: e.title,
        description: e.description,
        start: { dateTime: e.start.toISOString(), timeZone: e.timeZone },
        end: { dateTime: e.end.toISOString(), timeZone: e.timeZone },
        ...(e.attendeeEmail ? { attendees: [{ email: e.attendeeEmail }] } : {}),
      },
    },
  );
}

export async function searchDrive(userId: string, query: string) {
  const q = `fullText contains '${query.replace(/['\\]/g, ' ')}' and trashed = false`;
  const d = await googleFetch<{ files?: { id: string; name: string; mimeType: string }[] }>(
    userId,
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, pageSize: '5', fields: 'files(id,name,mimeType)' })}`,
  );
  return d.files ?? [];
}

export async function readDoc(userId: string, documentId: string) {
  return googleFetch<unknown>(
    userId,
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
  );
}

/** Pulls readable text out of a Google Docs document JSON (body.content[].paragraph.elements[].textRun). */
export function extractDocText(data: unknown, max = 6000): string {
  const out: string[] = [];
  let length = 0;
  const walk = (node: unknown) => {
    if (length > max) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      const run = o.textRun as { content?: unknown } | undefined;
      if (run && typeof run.content === 'string') {
        out.push(run.content);
        length += run.content.length;
      }
      for (const v of Object.values(o)) if (typeof v === 'object') walk(v);
    }
  };
  walk(data);
  return out.join('').slice(0, max).trim();
}

export async function loadGoogleState(userId: string) {
  const conn = await prisma.googleConnection.findUnique({ where: { userId } });
  const services = conn?.status === 'CONNECTED' ? servicesFromScopes(conn.scopes) : [];
  return { conn, services: new Set(services), settings: (conn?.settings ?? {}) as { calendarId?: string } };
}

export function encryptRefreshToken(token: string) {
  return encrypt(token);
}
