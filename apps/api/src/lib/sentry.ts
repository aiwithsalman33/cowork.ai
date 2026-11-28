/** Thin wrapper so callers can report errors without caring whether Sentry is configured (H4). */
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';

/** Removes anything personal or secret before an event leaves the server. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    const headers = event.request.headers ?? {};
    for (const h of Object.keys(headers))
      if (/cookie|authorization|csrf|signature|secret|token/i.test(h)) delete headers[h];
  }
  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
  }
  return event;
}

export function captureError(
  err: unknown,
  ctx: { requestId?: string; userId?: string | null; feature?: string } = {},
) {
  if (!Sentry.isInitialized()) return;
  Sentry.withScope((scope) => {
    if (ctx.requestId) scope.setTag('request_id', ctx.requestId);
    if (ctx.feature) scope.setTag('feature', ctx.feature);
    if (ctx.userId) scope.setUser({ id: ctx.userId }); // id only, never email or phone
    Sentry.captureException(err);
  });
}

/** Tags every error report from this request, whoever captures it (our handler or the SDK). */
export function tagRequest(requestId: string) {
  if (Sentry.isInitialized()) Sentry.getIsolationScope().setTag('request_id', requestId);
}

export function tagUser(userId: string) {
  if (Sentry.isInitialized()) Sentry.getIsolationScope().setUser({ id: userId });
}
