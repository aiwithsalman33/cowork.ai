import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { BufferJSON, initAuthCreds } from 'baileys';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dropBackup,
  openSession,
  sealSession,
  useEncryptedAuthState,
} from '../src/channels/wa-auth-state.js';

const dirs: string[] = [];
async function tempDir() {
  const d = await mkdtemp(join(tmpdir(), 'wa-'));
  dirs.push(d, `${d}.plain-backup`);
  return join(d, 'session');
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe('encrypted WhatsApp sessions (M9)', () => {
  it('stores creds and signal keys encrypted on disk and reads them back', async () => {
    const dir = await tempDir();
    const first = await useEncryptedAuthState(dir);
    await first.saveCreds();
    const key = { keyPair: { public: randomBytes(32), private: randomBytes(32) }, keyId: 7 };
    await first.state.keys.set({ 'pre-key': { '7': key.keyPair } });

    for (const f of await readdir(dir)) {
      const text = await readFile(join(dir, f), 'utf8');
      expect(text.startsWith('enc1:')).toBe(true);
      expect(text).not.toContain('noiseKey');
      expect(text).not.toContain('private');
    }

    const again = await useEncryptedAuthState(dir);
    expect(again.state.creds.registrationId).toBe(first.state.creds.registrationId);
    const got = await again.state.keys.get('pre-key', ['7']);
    expect(Buffer.from(got['7']!.private).equals(key.keyPair.private)).toBe(true);
    if (process.platform !== 'win32') expect((await stat(dir)).mode & 0o077).toBe(0);
  });

  it('migrates an existing plaintext session, keeping a backup until the next connect', async () => {
    const dir = await tempDir();
    await useEncryptedAuthState(dir); // creates the folder
    const creds = initAuthCreds();
    await writeFile(join(dir, 'creds.json'), JSON.stringify(creds, BufferJSON.replacer));

    const migrated = await useEncryptedAuthState(dir);
    expect(migrated.state.creds.registrationId).toBe(creds.registrationId); // same login, no new QR
    expect((await readFile(join(dir, 'creds.json'), 'utf8')).startsWith('enc1:')).toBe(true);
    expect(await readFile(join(`${dir}.plain-backup`, 'creds.json'), 'utf8')).toContain('noiseKey');

    await dropBackup(dir);
    await expect(stat(`${dir}.plain-backup`)).rejects.toThrow();
  });

  it('refuses tampered or wrongly keyed data', () => {
    const sealed = sealSession('{"a":1}');
    expect(openSession(sealed)).toBe('{"a":1}');
    expect(() => openSession(sealed, randomBytes(32))).toThrow();
    const tampered = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => openSession(tampered)).toThrow();
  });
});
