import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chatgptStore } from '../companion/chatgpt-store.mjs';

export async function selfCheck({ app, safeStorage, startupSettings }) {
  const directory = app.getPath('userData');
  const store = chatgptStore(directory, safeStorage);
  assert.equal(safeStorage.isEncryptionAvailable(), true, 'Windows credential protection is available');
  if (process.argv.includes('--read-credentials')) {
    assert.deepEqual(await store.load(), { hostId: 'urn:uuid:synthetic', account: null, secret: 'synthetic-rotated-secret' });
    process.stdout.write('credential-restart-passed\n');
    return;
  }
  const previous = app.getLoginItemSettings(startupSettings(false)).openAtLogin;
  try {
    await store.save({ hostId: 'urn:uuid:synthetic', account: null, secret: 'synthetic-secret' });
    assert.deepEqual(await store.load(), { hostId: 'urn:uuid:synthetic', account: null, secret: 'synthetic-secret' });
    await store.save({ hostId: 'urn:uuid:synthetic', account: null, secret: 'synthetic-rotated-secret' });
    assert.equal((await readFile(join(directory, 'chatgpt-credentials.electron'))).includes(Buffer.from('synthetic-rotated-secret')), false);
    app.setLoginItemSettings(startupSettings(true));
    assert.equal(app.getLoginItemSettings(startupSettings(true)).openAtLogin, true, 'login startup was registered');
    app.setLoginItemSettings(startupSettings(false));
    assert.equal(app.getLoginItemSettings(startupSettings(false)).openAtLogin, false, 'login startup was disabled');
    const output = await new Promise((resolve, reject) => {
      const args = [...(app.isPackaged ? [] : [app.getAppPath()]), '--self-check', directory, '--lock-probe'];
      const child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Duplicate-instance probe timed out.')); }, 15000);
      child.stdout.on('data', chunk => { text += chunk; });
      child.stderr.resume();
      child.on('error', reject);
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(text) : reject(new Error('Duplicate-instance probe failed.')); });
    });
    assert.match(output, /duplicate-blocked/);
    const report = { packaged: app.isPackaged, electron: process.versions.electron, bundledNode: process.versions.node, credentialProtection: 'passed', duplicateInstance: 'passed', startupRegisterDisable: 'passed', restartPersistence: 'pending separate process', credentials: 'synthetic only' };
    await writeFile(join(directory, 'self-check.json'), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally { app.setLoginItemSettings(startupSettings(previous)); }
}
