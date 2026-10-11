import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const encoding = "$ErrorActionPreference = 'Stop'; $utf8 = [Text.UTF8Encoding]::new($false); [Console]::InputEncoding = $utf8; [Console]::OutputEncoding = $utf8; Add-Type -AssemblyName System.Security; ";
const encrypt = `${encoding}$bytes = $utf8.GetBytes([Console]::In.ReadToEnd()); $encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($encrypted))`;
const decrypt = `${encoding}$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd()); $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write($utf8.GetString($plain))`;

function protect(script, value) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 262144) child.kill(); });
    child.stderr.resume();
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error('Windows credential protection failed.')));
    child.stdin.end(value);
  });
}

export function chatgptStore(directory = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Tablewright Assistant')) {
  if (process.platform !== 'win32' || !directory) throw new Error('ChatGPT sign-in currently requires Windows local credential storage.');
  const path = join(directory, 'chatgpt-credentials.dpapi');
  return {
    async load() {
      let saved;
      try { saved = await readFile(path, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      return JSON.parse(await protect(decrypt, saved));
    },
    async save(record) {
      await mkdir(directory, { recursive: true });
      const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        await writeFile(temporary, await protect(encrypt, JSON.stringify(record)), { mode: 0o600, flag: 'wx' });
        await rename(temporary, path);
      } finally { await rm(temporary, { force: true }); }
    }
  };
}
