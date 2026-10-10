import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageModule, PACKAGE_FILES, MODULE_FILES, root } from '../scripts/package.mjs';
import { inspectPackage } from '../scripts/inspect-package.mjs';

test('actual module ZIP is complete, self-contained, and excludes credentials and dependencies', async () => {
  const archive = await packageModule();
  const files = inspectPackage(archive);
  const prefix = 'tablewright-assistant/';
  assert.deepEqual(files.map(file => file.name).sort(), PACKAGE_FILES.map(name => prefix + name).sort());
  const manifest = JSON.parse(files.find(file => file.name === prefix + 'module.json').text);
  assert.equal(manifest.id, 'tablewright-assistant');
  assert.deepEqual(manifest.compatibility, { minimum: '13', maximum: '14' });
  assert.equal(Object.hasOwn(manifest.compatibility, 'verified'), false);
  assert.equal(files.some(file => /(^|\/)(node_modules|\.env|companion|mcp|work|\.git|test)(\/|$)/.test(file.name)), false);
  const names = new Set(files.map(file => file.name));
  for (const match of files.find(file => file.name === prefix + 'README.md').text.matchAll(/\]\((docs\/[^)]+\.md)\)/g)) assert.equal(names.has(prefix + match[1]), true);
  for (const path of [...manifest.esmodules, ...manifest.styles]) assert.equal(names.has(prefix + path), true);
  for (const file of files.filter(file => file.name.endsWith('.mjs'))) {
    for (const match of file.text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.equal(match[1].startsWith('.'), true, `browser import must be relative: ${file.name}`);
      const target = posix.normalize(posix.join(posix.dirname(file.name), match[1]));
      assert.equal(names.has(target), true, `missing import ${target}`);
    }
  }
  assert.equal(files.find(file => file.name === prefix + 'THIRD_PARTY_NOTICES').text.includes('Copyright (c) 2025 AI DM Project'), true);
  for (const file of MODULE_FILES) assert.equal(files.find(entry => entry.name === prefix + file).text, await readFile(join(root, 'module', file), 'utf8'));
});

test('every shipped browser module parses and token generation has the documented shape', () => {
  for (const file of MODULE_FILES.filter(file => file.endsWith('.mjs'))) execFileSync(process.execPath, ['--check', join(root, 'module', file)], { stdio: 'pipe' });
  const token = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/token.mjs', import.meta.url))], { encoding: 'utf8' }).trim();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});
