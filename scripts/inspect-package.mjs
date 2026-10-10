import { execFileSync } from 'node:child_process';
import { psLiteral } from './package.mjs';

export function inspectPackage(path) {
  const command = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead(${psLiteral(path)}); try { $files = @($zip.Entries | Where-Object { $_.Length -gt 0 } | ForEach-Object { $reader = [System.IO.StreamReader]::new($_.Open()); try { @{ name = $_.FullName.Replace('\\', '/'); text = $reader.ReadToEnd() } } finally { $reader.Dispose() } }); ConvertTo-Json -InputObject $files -Depth 3 -Compress } finally { $zip.Dispose() }`;
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })).map(file => ({ ...file, name: file.name.replaceAll('\\', '/') }));
}
