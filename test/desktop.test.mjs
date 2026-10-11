import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { parsePairing } from '../desktop/pairing.mjs';
import { startCompanion } from '../companion/server.mjs';
import { BrowserConnection } from '../module/scripts/connection.mjs';
import { config, origin, auth, rejectedSocket, memoryCredentialStore } from './transport-fixture.mjs';
import { fakeFoundry } from './fake-foundry.mjs';
import { liveCheck } from '../desktop/live-check.mjs';

const request = { origin, challenge: 'a'.repeat(64), worldId: auth.worldId, userId: auth.userId, systemId: 'pf2e' };
const link = values => { const url = new URL('tablewright://pair'); for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value); return url.href; };

test('live check permits only one Responses request and no world tools', async () => {
  const store = memoryCredentialStore();
  await store.save({ hostId: 'urn:uuid:synthetic', account: { clientId: 'synthetic', subject: 'gm', accessToken: 'synthetic', idToken: 'synthetic', expiresAt: Date.now() + 3600000, scopes: ['chatgpt.tokens.use.direct'], model: 'gpt-5.6-luna', models: [{ slug: 'gpt-5.6-luna', name: 'Luna' }] } });
  const response = output => new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output } })}\n\n`);
  const result = await liveCheck({ store, fetchImpl: async () => response([{ type: 'message', content: [{ type: 'output_text', text: 'TABLEWRIGHT_OK' }] }]) });
  assert.equal(result.requests, 1);
  let requests = 0;
  await assert.rejects(liveCheck({ store, fetchImpl: async () => { requests++; return response([{ type: 'function_call', name: 'connection_status', call_id: 'synthetic', arguments: '{}' }]); } }), /failed or timed out/);
  assert.equal(requests, 1);
});

test('native pairing links accept only exact origins and bounded one-use requests', () => {
  assert.deepEqual(parsePairing(link(request)), request);
  assert.equal(parsePairing(link({ ...request, origin: 'https://foundry.example' })).origin, 'https://foundry.example');
  for (const changes of [{ origin: origin + '/' }, { origin: 'https://user:pass@example.com' }, { challenge: 'short' }, { userId: 'gm\nadmin' }, { systemId: 'dnd5e' }, { callback: 'https://evil.example' }]) assert.throws(() => parsePairing(link({ ...request, ...changes })));
  assert.throws(() => parsePairing(link(request) + '&origin=https://evil.example'));
  assert.throws(() => parsePairing(link(request).replace('tablewright:', 'https:')));
});

test('desktop denies unapproved origins, mismatched identities, replay, and competing sessions', async t => {
  const server = await startCompanion(config, { credentialStore: memoryCredentialStore(), desktopPairing: true });
  t.after(() => server.close());
  assert.equal(await rejectedSocket(server.port, { origin }), 403);
  server.approvePairing(request);
  assert.equal(await rejectedSocket(server.port, { origin: 'https://evil.example' }), 403);
  const bad = new WebSocket(`ws://127.0.0.1:${server.port}/browser`, { origin });
  await once(bad, 'open');
  const denied = once(bad, 'close');
  bad.send(JSON.stringify({ ...auth, token: request.challenge, userId: 'player' }));
  assert.equal((await denied)[0], 1008);
  assert.equal(server.status().connected, false);
  const good = new WebSocket(`ws://127.0.0.1:${server.port}/browser`, { origin });
  await once(good, 'open');
  const paired = once(good, 'message');
  good.send(JSON.stringify({ ...auth, token: request.challenge }));
  assert.equal(JSON.parse((await paired)[0]).type, 'paired');
  assert.equal(server.status().connected, true);
  assert.throws(() => server.approvePairing(request), /Disconnect/);
  assert.equal(await rejectedSocket(server.port, { origin }), 403);
  const closed = once(good, 'close');
  server.disconnect();
  await closed;
  assert.equal(await rejectedSocket(server.port, { origin }), 403);
});

test('pairing expires without leaving an approved origin', async t => {
  const server = await startCompanion(config, { credentialStore: memoryCredentialStore(), desktopPairing: true });
  t.after(() => server.close());
  server.approvePairing(request);
  const previous = Date.now;
  Date.now = () => previous() + 120001;
  try { assert.equal(await rejectedSocket(server.port, { origin }), 403); }
  finally { Date.now = previous; }
});

test('HTTPS browser requests loopback transport and recovers with constructor fallback', async t => {
  const remoteOrigin = 'https://foundry.example';
  const server = await startCompanion({ ...config, origin: remoteOrigin }, { credentialStore: memoryCredentialStore() });
  t.after(() => server.close());
  const attempts = [];
  class CompatibleSocket extends WebSocket {
    constructor(url, options) { attempts.push(options); if (options) throw new TypeError('Older options signature'); super(url, { origin: remoteOrigin }); }
  }
  const env = fakeFoundry();
  const browser = new BrowserConnection(env.adapter, env.plans, () => {}, { pageProtocol: 'https:', WebSocketClass: CompatibleSocket });
  await browser.connect(`ws://127.0.0.1:${server.port}/browser`, config.token);
  assert.deepEqual(attempts, [{ targetAddressSpace: 'loopback' }, undefined]);
  assert.equal(browser.connected, true);
  browser.disconnect();
  assert.equal(env.writes.length, 0);
});

test('desktop opens OAuth itself and never returns the authorization URL to Foundry', async t => {
  const opened = [];
  const server = await startCompanion(config, { credentialStore: memoryCredentialStore(), openAuthorization: async url => { opened.push(url); } });
  t.after(() => server.close());
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/browser`, { origin });
  await once(ws, 'open');
  const paired = once(ws, 'message');
  ws.send(JSON.stringify(auth));
  await paired;
  const reply = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'chatgpt', id: 'begin', action: 'begin' }));
  const result = JSON.parse((await reply)[0]);
  assert.deepEqual(result.result, {});
  assert.equal(opened.length, 1);
  assert.equal(new URL(opened[0]).origin, 'https://auth.openai.com');
  ws.close();
});
