import { fail } from '../module/lib/validation.mjs';

export async function boundedJSON(stream, maximum) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maximum) fail('PAYLOAD', 'The payload exceeded its size limit.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail('JSON', 'The payload is not valid JSON.');
  }
}
