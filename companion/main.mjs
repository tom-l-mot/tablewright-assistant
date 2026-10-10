import { companionConfig } from './config.mjs';
import { startCompanion } from './server.mjs';
import { safeError } from '../module/lib/validation.mjs';

try {
  const companion = await startCompanion(companionConfig());
  process.stderr.write(`PF2e assistant companion listening on 127.0.0.1:${companion.port}.\n`);
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, async () => { await companion.close(); process.exit(0); });
} catch (error) {
  process.stderr.write(`${safeError(error).message}\n`);
  process.exitCode = 1;
}
