import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { startCompanion } from '../companion/server.mjs';
import { BrowserConnection } from '../module/scripts/connection.mjs';
import { assistantCommand, approveFromClick, windowMarkup } from '../module/scripts/ui.mjs';
import { config, origin, token, rpc, memoryCredentialStore } from './transport-fixture.mjs';
import { fakeFoundry, npcRequest } from './fake-foundry.mjs';

class LocalBrowserSocket extends WebSocket {
  constructor(url) { super(url, { origin }); }
}

test('assistant chat prefix routes only GM commands and preserves regular chat', () => {
  assert.deepEqual(assistantCommand('@assistant create a scout', true), { prompt: 'create a scout' });
  assert.deepEqual(assistantCommand(' @Assistant ', true), { prompt: '' });
  for (const message of ['hello', 'hello @assistant', '@assistantship', '/roll 1d20']) assert.equal(assistantCommand(message, true), null);
  assert.equal(assistantCommand('@assistant create a scout', false), null);
});

test('browser approval requires a trusted click before any world write', async () => {
  const env = fakeFoundry();
  const plan = await env.plans.propose(npcRequest);
  await assert.rejects(approveFromClick({ isTrusted: false }, plan.id, env.plans), /requires a GM click/);
  assert.equal(env.writes.length, 0);
  assert.equal((await approveFromClick({ isTrusted: true }, plan.id, env.plans)).state, 'complete');
  assert.equal(env.writes.length, 1);
});

test('window markup escapes model/source/user text and supplies labels and status focus', async () => {
  const env = fakeFoundry();
  const plan = await env.plans.propose({ ...npcRequest, name: '<img src=x onerror=alert(1)>' });
  const html = windowMarkup({ connectionState: 'connected', providerConfigured: true, busy: false, url: 'ws://127.0.0.1:33333/browser', party: { level: '', size: '', threat: 'moderate' }, status: 'Ready', prompt: '</textarea><script>bad()</script>', response: '<script>bad()</script>', chatgpt: { signedIn: true, email: '<img src=x onerror=bad()>', models: [{ slug: 'safe', name: '<script>bad()</script>' }], model: 'safe' }, plans: [plan] });
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('&lt;script&gt;'), true);
  for (const id of ['assistant-prompt', 'assistant-level', 'assistant-size', 'assistant-threat']) {
    assert.equal(html.includes(`for="${id}"`), true);
    assert.equal(html.includes(`id="${id}"`), true);
  }
  assert.equal(html.includes('role="status"'), true);
  assert.equal(html.includes('tabindex="-1"'), true);
  assert.equal(html.includes('assistant-token'), false);
  assert.equal(html.includes('Pair desktop'), true);
  assert.equal(html.includes('for="assistant-model"'), true);

});

test('actual browser client pairs, answers narrow companion calls, and never imports remotely', async t => {
  const server = await startCompanion(config, { credentialStore: memoryCredentialStore() });
  t.after(() => server.close());
  const env = fakeFoundry();
  const connection = new BrowserConnection(env.adapter, env.plans, () => {}, { WebSocketClass: LocalBrowserSocket });
  await connection.connect(`ws://127.0.0.1:${server.port}/browser`, token);
  assert.equal(connection.connected, true);
  const response = await rpc(server.port, 'propose_creation', { request: npcRequest });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.state, 'pending');
  assert.equal(env.writes.length, 0);
  const failed = await rpc(server.port, 'approve', {});
  assert.equal(failed.status, 400);
  assert.equal(env.writes.length, 0);
  const closed = once(connection.ws, 'close');
  connection.disconnect();
  await closed;
  assert.equal(connection.state, 'disconnected');
});

test('browser client rejects credentials in a socket URL', async () => {
  const env = fakeFoundry();
  const local = new BrowserConnection(env.adapter, env.plans, () => {});
  for (const url of ['ws://127.0.0.1:33333/browser?token=secret', 'ws://localhost:33333/browser', 'ws://user:pass@127.0.0.1:33333/browser']) await assert.rejects(local.connect(url, token));
  assert.equal(env.writes.length, 0);
});
