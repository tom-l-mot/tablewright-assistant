import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { startCompanion } from '../companion/server.mjs';
import { companionConfig } from '../companion/config.mjs';
import { MAX_BODY, MAX_FRAME } from '../module/lib/protocol.mjs';
import { config, token, origin, auth, connectBrowser, fakeGM, rpc, rejectedSocket, memoryCredentialStore } from './transport-fixture.mjs';
import { npcRequest } from './fake-foundry.mjs';

async function serverFor(t, overrides = {}, options = {}) {
  const server = await startCompanion({ ...config, ...overrides }, { credentialStore: memoryCredentialStore(), ...options });
  t.after(() => server.close());
  return server;
}

test('config enforces exact HTTP Foundry origin, separate token, and explicit provider model', () => {
  const env = { ASSISTANT_TOKEN: token, FOUNDRY_ORIGIN: origin };
  assert.equal(companionConfig(env).apiKey, '');
  assert.throws(() => companionConfig({ ...env, FOUNDRY_ORIGIN: 'https://localhost:30000' }), /HTTP origin/);
  assert.throws(() => companionConfig({ ...env, FOUNDRY_ORIGIN: origin + '/' }), /exact HTTP/);
  assert.throws(() => companionConfig({ ...env, ASSISTANT_TOKEN: 'short' }), /separate random token/);
  assert.throws(() => companionConfig({ ...env, OPENAI_API_KEY: 'not-real' }), /explicit OPENAI_MODEL/);
  assert.throws(() => companionConfig({ ...env, OPENAI_RESPONSES_URL: 'http://example.com/responses' }), /HTTPS/);
});

test('actual loopback HTTP rejects wrong auth, Host, Origin, payload, and approval methods', async t => {
  const server = await serverFor(t);
  assert.equal((await rpc(server.port, 'connection_status')).status, 200);
  assert.equal((await rpc(server.port, 'connection_status', {}, { Authorization: 'Bearer wrong' })).status, 401);
  const rejectedHost = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.port, path: '/rpc', method: 'POST', headers: { Host: 'evil.example', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end(JSON.stringify({ method: 'connection_status', args: {} }));
  });
  assert.equal(rejectedHost, 403);
  assert.equal((await rpc(server.port, 'connection_status', {}, { Origin: origin })).status, 403);
  const unsupported = await rpc(server.port, 'approve', { id: '1234567890123456' });
  assert.equal(unsupported.status, 400);
  assert.equal((await unsupported.json()).error.code, 'METHOD');
  const invalid = await rpc(server.port, 'world_context', { fullWorldExport: true });
  assert.equal(invalid.status, 400);
  const oversized = await fetch(`http://127.0.0.1:${server.port}/rpc`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: 'x'.repeat(MAX_BODY + 1) });
  assert.equal(oversized.status, 413);
  const malformed = await fetch(`http://127.0.0.1:${server.port}/rpc`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400);
  assert.equal((await rpc(server.port, 'connection_status')).status, 200);
});

test('browser upgrades require exact Origin, Host, path, and first-message authentication', async t => {
  const server = await serverFor(t);
  assert.equal(await rejectedSocket(server.port, { origin: 'http://evil.example' }), 403);
  assert.equal(await rejectedSocket(server.port, { origin, headers: { Host: 'evil.example' } }), 403);
  assert.equal(await rejectedSocket(server.port, { origin }, '/browser?token=not-allowed'), 403);
  const ws = await connectBrowser(server.port, null);
  const closed = once(ws, 'close');
  ws.send(JSON.stringify({ ...auth, token: 'incorrect' }));
  assert.equal((await closed)[0], 1008);
});

test('one selected browser/world rejects competing pairing and expires unauthenticated sockets', async t => {
  const server = await serverFor(t, {}, { authTimeout: 50 });
  const empty = await connectBrowser(server.port, null);
  assert.equal((await once(empty, 'close'))[0], 1008);
  const gm = await fakeGM(server.port);
  assert.equal(await rejectedSocket(server.port, { origin }), 409);
  const status = (await (await rpc(server.port, 'connection_status')).json()).result;
  assert.deepEqual(status, { connected: true, worldId: 'test-world', userId: 'gm', providerConfigured: false });
  const closed = once(gm.ws, 'close');
  gm.ws.close();
  await closed;
  const next = await fakeGM(server.port);
  assert.equal((await (await rpc(server.port, 'connection_status')).json()).result.connected, true);
  next.ws.close();
});

test('oversized browser frames close the connection', async t => {
  const server = await serverFor(t);
  const ws = await connectBrowser(server.port);
  const closed = once(ws, 'close');
  ws.send('x'.repeat(MAX_FRAME + 1));
  assert.equal((await closed)[0], 1009);
});

test('real companion routes proposals without inference or world writes', async t => {
  const server = await serverFor(t);
  const gm = await fakeGM(server.port);
  const response = await rpc(server.port, 'propose_creation', { request: npcRequest });
  assert.equal(response.status, 200);
  const plan = (await response.json()).result;
  assert.equal(plan.state, 'pending');
  assert.equal(gm.writes.length, 0);
  const read = (await (await rpc(server.port, 'get_plan', { id: plan.id })).json()).result;
  assert.equal(read.name, npcRequest.name);
  assert.equal((await rpc(server.port, 'import', {})).status, 400);
  assert.equal(gm.writes.length, 0);
  gm.ws.close();
});

test('malformed browser errors reject pending requests rather than leaving them unresolved', async t => {
  const server = await serverFor(t);
  const ws = await connectBrowser(server.port);
  ws.on('message', raw => {
    const call = JSON.parse(raw.toString());
    if (call.type === 'call') ws.send(JSON.stringify({ type: 'result', id: call.id, error: null }));
  });
  const response = await rpc(server.port, 'world_context');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'DISCONNECTED');
});

test('disconnect during a pending read rejects the actual HTTP request', async t => {
  const server = await serverFor(t);
  const ws = await connectBrowser(server.port);
  const call = once(ws, 'message');
  const response = rpc(server.port, 'world_context');
  await call;
  ws.close();
  const value = await response;
  assert.equal(value.status, 400);
  assert.equal((await value.json()).error.code, 'DISCONNECTED');
});

test('nested results redact provider credentials including escaped characters', async t => {
  const secret = 'fake-key-with-"quote"-and-\\backslash';
  const server = await serverFor(t, { apiKey: secret });
  const gm = await fakeGM(server.port);
  gm.game.world.title = `prefix ${secret} suffix`;
  gm.actorRaw.name = secret;
  const context = await (await rpc(server.port, 'world_context')).json();
  const source = await (await rpc(server.port, 'read_source', { uuid: 'Compendium.pf2e.bestiary.Actor.1234567890ABCDEF' })).json();
  assert.equal(context.result.world.title, 'prefix [redacted] suffix');
  assert.equal(source.result.source.name, '[redacted]');
  gm.ws.close();
});
