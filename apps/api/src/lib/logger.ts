import { pino, type LoggerOptions } from 'pino';
import { env, isProd, isTest } from '../config.js';

/** Paths that must never reach the logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["x-telegram-bot-api-secret-token"]',
  'req.headers["x-hub-signature-256"]',
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.apiKey',
  '*.accessToken',
  '*.appSecret',
  '*.botToken',
  '*.token',
  '*.refreshToken',
  '*.encryptedKey',
  '*.encryptedConfig',
  '*.secret',
];

/** Logged request: method + path only. Query strings can carry tokens or personal data (L3). */
export function reqSerializer(req: { method?: string; url?: string; id?: string }) {
  return { method: req.method, url: (req.url ?? '').split('?')[0], id: req.id };
}

export const loggerOptions: LoggerOptions = {
  level: isTest ? 'silent' : env.LOG_LEVEL,
  serializers: { req: reqSerializer },
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: { service: 'cowork-api' },
  ...(isProd || isTest
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
};

export const logger = pino(loggerOptions);

/** Mask secrets that may appear inside free text (e.g. provider error messages echoing a key). */
export function scrubSecrets(text: string): string {
  return text
    .replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1…')
    .replace(/(gsk_[A-Za-z0-9]{4})[A-Za-z0-9]+/g, '$1…')
    .replace(/(AIza[0-9A-Za-z_-]{4})[0-9A-Za-z_-]+/g, '$1…')
    .replace(/\b(\d{6,}:)[A-Za-z0-9_-]{30,}\b/g, '$1…')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1…');
}
