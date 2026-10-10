import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, copyFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODULE_FILES = [
  'module.json', 'lib/validation.mjs', 'lib/encounter.mjs', 'lib/creation.mjs',
  'lib/index-fields.mjs', 'lib/plans.mjs', 'lib/protocol.mjs',
  'scripts/foundry-adapter.mjs', 'scripts/connection.mjs', 'scripts/main.mjs',
  'scripts/ui.mjs', 'scripts/window.mjs', 'styles/assistant.css'
];
export const PACKAGE_FILES = [...MODULE_FILES, 'LICENSE', 'THIRD_PARTY_NOTICES', 'README.md', 'docs/install.md', 'docs/architecture.md', 'docs/provenance.md', 'docs/verification.md'];
export const root = fileURLToPath(new URL('../', import.meta.url));
export const psLiteral = value => `'${value.replaceAll("'", "''")}'`;

export async function packageModule() {
  // shortcut: ZIP packaging uses Windows PowerShell, add another platform only after its archive checks pass.
  if (process.platform !== 'win32') throw new Error('This alpha packages ZIP files with Windows PowerShell.');
  const manifest = JSON.parse(await readFile(join(root, 'module/module.json'), 'utf8'));
  if (manifest.id !== 'tablewright-assistant' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(manifest.version)) throw new Error('Invalid package identity.');
  const dist = join(root, 'dist');
  await mkdir(dist, { recursive: true });
  const stage = await mkdtemp(join(dist, 'package-'));
  const folder = join(stage, manifest.id);
  for (const file of MODULE_FILES) {
    const target = join(folder, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, 'module', file), target);
  }
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES', 'README.md', 'docs/install.md', 'docs/architecture.md', 'docs/provenance.md', 'docs/verification.md']) {
    const target = join(folder, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, file), target);
  }
  const archive = join(dist, `${manifest.id}-${manifest.version}.zip`);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath ${psLiteral(folder)} -DestinationPath ${psLiteral(archive)} -CompressionLevel Optimal -Force`], { windowsHide: true, stdio: 'pipe' });
  return archive;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.stdout.write(`${await packageModule()}\n`); }
  catch { process.stderr.write('Module packaging failed. Check source files and Windows PowerShell.\n'); process.exitCode = 1; }
}
