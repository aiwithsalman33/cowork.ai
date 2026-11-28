/**
 * Encrypted WhatsApp (Baileys) session storage (audit M9).
 *
 * Same file layout as Baileys' useMultiFileAuthState, but every file is encrypted with AES-256-GCM
 * (key derived from ENCRYPTION_KEY with HKDF, info "wa-sessions"), and folders are created 0700.
 *
 * Existing plaintext sessions keep working: on start the folder is copied to "<dir>.plain-backup"
 * once, every file is encrypted in place, and the backup is deleted after the next successful
 * WhatsApp connection (dropBackup). Unreadable files behave like Baileys does (treated as missing).
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { chmod, cp, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from 'baileys';
import { env } from '../config.js';
import { logger } from '../lib/logger.js';

const PREFIX = 'enc1:';
const KEY = Buffer.from(
  hkdfSync('sha256', Buffer.from(env.ENCRYPTION_KEY, 'hex'), Buffer.alloc(0), 'wa-sessions', 32),
);

export function sealSession(json: string, key: Buffer = KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

/** Plaintext (legacy) is returned unchanged; encrypted content is decrypted. Throws if tampered. */
export function openSession(text: string, key: Buffer = KEY): string {
  if (!text.startsWith(PREFIX)) return text;
  const raw = Buffer.from(text.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

const backupOf = (dir: string) => `${dir}.plain-backup`;

/** One-time: encrypts plaintext files in place, keeping a backup copy until the next connect. */
export async function migratePlaintext(dir: string): Promise<number> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'));
  const plain: string[] = [];
  for (const f of files) {
    const text = await readFile(join(dir, f), 'utf8').catch(() => '');
    if (text && !text.startsWith(PREFIX)) plain.push(f);
  }
  if (!plain.length) return 0;
  const backup = backupOf(dir);
  if (!(await stat(backup).catch(() => null))) await cp(dir, backup, { recursive: true });
  for (const f of plain) {
    const text = await readFile(join(dir, f), 'utf8');
    await writeFile(join(dir, f), sealSession(text), { mode: 0o600 });
  }
  logger.info({ dir, files: plain.length }, 'WhatsApp session files encrypted');
  return plain.length;
}

/** Called after a successful connection: the encrypted session works, so the plaintext copy can go. */
export async function dropBackup(dir: string) {
  await rm(backupOf(dir), { recursive: true, force: true });
}

/** Warns when the sessions directory is readable by other users on the server. */
export async function checkSessionsDirPermissions(root: string) {
  // tighten an existing folder (older volumes were created 0755); ignore if we may not
  if (process.platform !== 'win32') await chmod(root, 0o700).catch(() => undefined);
  const s = await stat(root).catch(() => null);
  if (s && process.platform !== 'win32' && (s.mode & 0o077) !== 0)
    logger.warn(
      { root, mode: (s.mode & 0o777).toString(8) },
      'WhatsApp sessions directory is readable by others',
    );
}

// one write at a time per file (Baileys does the same; see its issue #794)
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(path) ?? Promise.resolve()).then(fn, fn);
  locks.set(
    path,
    run.catch(() => undefined),
  );
  return run;
}

export async function useEncryptedAuthState(
  dir: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await migratePlaintext(dir);
  const fix = (file: string) => file.replace(/\//g, '__').replace(/:/g, '-');

  const writeData = (data: unknown, file: string) => {
    const path = join(dir, fix(file));
    return withLock(path, () =>
      writeFile(path, sealSession(JSON.stringify(data, BufferJSON.replacer)), { mode: 0o600 }),
    );
  };
  const readData = async (file: string) => {
    const path = join(dir, fix(file));
    try {
      return await withLock(path, async () =>
        JSON.parse(openSession(await readFile(path, 'utf8')), BufferJSON.reviver),
      );
    } catch {
      return null;
    }
  };
  const removeData = (file: string) => {
    const path = join(dir, fix(file));
    return withLock(path, () => unlink(path).catch(() => undefined));
  };

  const creds: AuthenticationCreds = (await readData('creds.json')) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`);
              if (type === 'app-state-sync-key' && value)
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap] ?? {};
            for (const id in entries) {
              const value = entries[id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds.json'),
  };
}
