import { once } from 'node:events';
import { WebSocket } from 'ws';
import { browserTool } from '../module/lib/protocol.mjs';
import { safeError } from '../module/lib/validation.mjs';
import { fakeFoundry } from './fake-foundry.mjs';

export const token = 'test-only-token-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const origin = 'http://localhost:30000';
export const config = { token, origin, port: 0, apiKey: '', model: '', endpoint: 'https://api.openai.com/v1/responses' };
export const auth = { type: 'auth', token, worldId: 'test-world', userId: 'gm', systemId: 'pf2e' };

export async function connectBrowser(port, message = auth) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/browser`, { origin });
  ws.on('error', () => {});
  await once(ws, 'open');
  if (message) {
    const paired = once(ws, 'message');
    ws.send(JSON.stringify(message));
    await paired;
  }
  return ws;
}

export async function fakeGM(port) {
  const env = fakeFoundry();
  const ws = await connectBrowser(port);
  ws.on('message', async raw => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'call') return;
    try {
      const result = await browserTool(env.adapter, env.plans, message.method, message.args);
      ws.send(JSON.stringify({ type: 'result', id: message.id, result }));
    } catch (error) {
      ws.send(JSON.stringify({ type: 'result', id: message.id, error: safeError(error) }));
    }
  });
  return { ...env, ws };
}

export async function rpc(port, method, args = {}, headers = {}) {
  return fetch(`http://127.0.0.1:${port}/rpc`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ method, args }) });
}

export function rejectedSocket(port, options, path = '/browser') {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, options);
    ws.on('error', () => {});
    ws.on('unexpected-response', (_request, response) => { response.resume(); ws.terminate(); resolve(response.statusCode); });
  });
}
