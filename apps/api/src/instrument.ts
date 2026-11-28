/**
 * Sentry error tracking (audit H4). Loaded before the app: `node --import ./dist/instrument.js dist/index.js`.
 * Does nothing unless SENTRY_DSN is set. Never sends cookies, authorization headers, request bodies or
 * other personal data.
 */
import * as Sentry from '@sentry/node';
import { scrubEvent } from './lib/sentry.js';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production',
    release: process.env.APP_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}
