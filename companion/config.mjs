import { fail, integer, text } from '../module/lib/validation.mjs';

export function proxyConfig(env = process.env) {
  const token = env.ASSISTANT_TOKEN;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) fail('CONFIG', 'Set ASSISTANT_TOKEN to a separate random token of at least 32 characters.');
  const port = Number(env.ASSISTANT_PORT ?? 33333);
  integer(port, 1024, 65535);
  return { token, port };
}

export function companionConfig(env = process.env) {
  const config = proxyConfig(env);
  let origin;
  let endpoint;
  try {
    origin = new URL(env.FOUNDRY_ORIGIN);
    endpoint = new URL(env.OPENAI_RESPONSES_URL ?? 'https://api.openai.com/v1/responses');
  } catch {
    fail('CONFIG', 'Set an exact FOUNDRY_ORIGIN and a valid OPENAI_RESPONSES_URL.');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.FOUNDRY_ORIGIN || origin.username || origin.password) fail('CONFIG', 'FOUNDRY_ORIGIN must be an exact HTTP or HTTPS origin.');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) fail('CONFIG', 'The provider endpoint must use HTTPS without credentials, a query, or a fragment.');
  const apiKey = env.OPENAI_API_KEY ?? '';
  if (apiKey && (!env.OPENAI_MODEL || /[\r\n]/.test(apiKey))) fail('CONFIG', 'A provider key requires an explicit OPENAI_MODEL and cannot contain newlines.');
  if (apiKey && apiKey === config.token) fail('CONFIG', 'The companion token must differ from the provider key.');
  if (env.OPENAI_MODEL) text(env.OPENAI_MODEL, 1, 100);
  return { ...config, origin: origin.origin, apiKey, model: env.OPENAI_MODEL ?? '', endpoint: endpoint.href };
}
