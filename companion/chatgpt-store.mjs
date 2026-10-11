import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function chatgptStore(directory, protection) {
  const path = join(directory, 'chatgpt-credentials.electron');
  return {
    async load() {
      let saved;
      try { saved = await readFile(path); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (!protection.isEncryptionAvailable()) throw new Error('Operating-system credential protection is unavailable.');
      return JSON.parse(protection.decryptString(saved));
    },
    async save(record) {
      if (!protection.isEncryptionAvailable()) throw new Error('Operating-system credential protection is unavailable.');
      await mkdir(directory, { recursive: true });
      const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        await writeFile(temporary, protection.encryptString(JSON.stringify(record)), { mode: 0o600, flag: 'wx' });
        await rename(temporary, path);
      } finally { await rm(temporary, { force: true }); }
    }
  };
}
