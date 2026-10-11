import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ChatGPTAuth } from '../companion/chatgpt-auth.mjs';
import { chatgptStore } from '../companion/chatgpt-store.mjs';
import { runProvider } from '../companion/provider.mjs';
import { startCompanion } from '../companion/server.mjs';
import { BrowserConnection } from '../module/scripts/connection.mjs';
import { fakeFoundry } from './fake-foundry.mjs';
import { config, origin, connectBrowser, memoryCredentialStore } from './transport-fixture.mjs';

const tokenResponse = suffix => ({ access_token: `access-${suffix}`, refresh_token: `refresh-${suffix}`, id_token: `id-${suffix}`, token_type: 'Bearer', expires_in: 3600, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct' });
const catalog = { models: [{ slug: 'test-model', display_name: 'Test Model', visibility: 'list' }, { slug: 'hidden', display_name: 'Hidden', visibility: 'hidden' }] };

test('Windows credential file is DPAPI protected and survives a process read', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tablewright-store-test-'));
  assert.equal(resolve(directory).startsWith(resolve(tmpdir()) + sep), true);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = chatgptStore(directory);
  await store.save({ hostId: 'test-host', secret: 'fake-refresh-secret' });
  assert.deepEqual(await store.load(), { hostId: 'test-host', secret: 'fake-refresh-secret' });
  await store.save({ hostId: 'test-host', secret: 'rotated-secret' });
  assert.deepEqual(await store.load(), { hostId: 'test-host', secret: 'rotated-secret' });
  assert.equal((await readFile(join(directory, 'chatgpt-credentials.dpapi'), 'utf8')).includes('fake-refresh-secret'), false);
});

function fakeOpenAI() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/models')) return new Response(JSON.stringify(catalog));
    if (url.endsWith('/oauth/revoke')) return new Response();
    if (url.endsWith('/oauth/token')) return new Response(JSON.stringify(tokenResponse(new URLSearchParams(options.body).get('grant_type') === 'refresh_token' ? 'renewed' : 'initial')));
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { calls, fetchImpl };
}

test('ChatGPT OAuth checks state, uses issued client ID and PKCE, selects listed models, rotates tokens, and signs out', async () => {
  const store = memoryCredentialStore();
  const openai = fakeOpenAI();
  const verified = [];
  const auth = new ChatGPTAuth({ store, fetchImpl: openai.fetchImpl, verifyIdToken: async (...args) => { verified.push(args); return { subject: 'account-1', email: 'gm@example.test' }; } });
  const redirect = 'http://127.0.0.1:33333/auth/callback';
  const url = new URL(await auth.begin(redirect));
  assert.equal(url.origin, 'https://auth.openai.com');
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(url.searchParams.get('redirect_uri'), redirect);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('ext_agent_host_id'), /^urn:uuid:/);
  await assert.rejects(auth.callback(new URL(`${redirect}?code=wrong&state=wrong&client_id=oaiapp_test`)), /did not match/);
  const callback = new URL(`${redirect}?code=good&client_id=oaiapp_test`);
  callback.searchParams.set('state', url.searchParams.get('state'));
  assert.equal((await auth.callback(callback)).model, 'test-model');
  assert.deepEqual(verified, [['id-initial', 'oaiapp_test', url.searchParams.get('nonce')]]);
  const exchange = openai.calls.find(call => call.url.endsWith('/oauth/token'));
  const form = new URLSearchParams(exchange.options.body);
  assert.equal(form.get('client_id'), 'oaiapp_test');
  assert.equal(form.get('code_verifier').length >= 43, true);
  assert.equal(form.get('redirect_uri'), redirect);
  assert.equal(auth.status().models.length, 1);
  assert.equal(JSON.stringify(auth.status()).includes('access-initial'), false);
  await assert.rejects(auth.begin(redirect, true), /Sign out/);
  auth.record.account.expiresAt = 0;
  assert.deepEqual(await Promise.all([auth.accessToken(), auth.accessToken()]), ['access-renewed', 'access-renewed']);
  assert.equal(openai.calls.filter(call => call.url.endsWith('/oauth/token')).length, 2);
  assert.equal((await store.load()).account.refreshToken, 'refresh-renewed');
  assert.equal((await auth.signOut()).signedIn, false);
  assert.equal((await store.load()).account.refreshToken, undefined);
  const later = new URL(await auth.begin(redirect));
  assert.equal(later.searchParams.get('client_id'), 'oaiapp_test');
  assert.equal(later.searchParams.get('ext_agent_host_id'), url.searchParams.get('ext_agent_host_id'));
  const denied = new URL(`${redirect}?error=access_denied`);
  denied.searchParams.set('state', later.searchParams.get('state'));
  await assert.rejects(auth.callback(denied), /cancelled/);
  const other = new URL(await auth.begin(redirect, true));
  assert.equal(other.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(other.searchParams.get('ext_agent_host_id'), url.searchParams.get('ext_agent_host_id'));
});

test('paired GM can initiate sign-in; callback requires matching state and never sends tokens to Foundry', async t => {
  const openai = fakeOpenAI();
  const server = await startCompanion(config, { credentialStore: memoryCredentialStore(), fetchImpl: openai.fetchImpl, verifyIdToken: async () => ({ subject: 'account-1', email: 'gm@example.test' }) });
  t.after(() => server.close());
  const ws = await connectBrowser(server.port);
  t.after(() => ws.close());
  const reply = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'chatgpt', id: 'begin-1', action: 'begin' }));
  const signIn = JSON.parse((await reply)[0].toString());
  assert.equal(signIn.type, 'chatgpt_result');
  const url = new URL(signIn.result.url);
  const bad = await fetch(`http://127.0.0.1:${server.port}/auth/callback?code=wrong&state=wrong&client_id=oaiapp_test`);
  assert.equal(bad.status, 400);
  const callback = new URL(`http://127.0.0.1:${server.port}/auth/callback`);
  callback.searchParams.set('code', 'good');
  callback.searchParams.set('state', url.searchParams.get('state'));
  callback.searchParams.set('client_id', 'oaiapp_test');
  const status = once(ws, 'message');
  assert.equal((await fetch(callback)).status, 200);
  const event = JSON.parse((await status)[0].toString());
  assert.equal(event.type, 'chatgpt_status');
  assert.equal(event.providerConfigured, true);
  assert.equal(event.status.email, 'gm@example.test');
  assert.equal(JSON.stringify(event).includes('access-initial'), false);
});

test('Foundry browser remains paired after signing out of ChatGPT', async t => {
  const openai = fakeOpenAI();
  const server = await startCompanion(config, { credentialStore: memoryCredentialStore(), fetchImpl: openai.fetchImpl, verifyIdToken: async () => ({ subject: 'account-1', email: 'gm@example.test' }) });
  t.after(() => server.close());
  const foundry = fakeFoundry();
  class LocalSocket extends WebSocket { constructor(url) { super(url, { origin }); } }
  const browser = new BrowserConnection(foundry.adapter, foundry.plans, () => {}, { WebSocketClass: LocalSocket });
  await browser.connect(`ws://127.0.0.1:${server.port}/browser`, config.token);
  t.after(() => browser.disconnect());
  const url = new URL(await browser.beginChatGPT());
  const callback = new URL(`http://127.0.0.1:${server.port}/auth/callback`);
  callback.searchParams.set('code', 'good');
  callback.searchParams.set('state', url.searchParams.get('state'));
  callback.searchParams.set('client_id', 'oaiapp_test');
  assert.equal((await fetch(callback)).status, 200);
  const result = await browser.signOutChatGPT();
  assert.equal(result.revoked, true);
  assert.equal(browser.connected, true);
});

test('ChatGPT Responses uses supported streamed payload and requires a completed event', async () => {
  const bodies = [];
  let turn = 0;
  const fetchImpl = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    const output = turn++ === 0 ? [{ type: 'function_call', call_id: 'call-1', name: 'world_context', arguments: '{}', status: 'completed' }] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Review the plan.' }] }];
    return new Response(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output } })}\n\n`);
  };
  const result = await runProvider({ chatgptToken: 'test-access', apiKey: '', model: 'test-model', endpoint: 'https://api.openai.com/v1/responses' }, 'Find a scout', { level: 1, size: 4, threat: 'low' }, async () => ({ world: 'test' }), { fetchImpl });
  assert.equal(result.text, 'Review the plan.');
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal('max_output_tokens' in body, false);
    assert.equal('tools' in body, false);
    assert.equal(body.input[0].type, 'additional_tools');
  }
  assert.equal(bodies[1].input.some(item => item.type === 'function_call_output' && item.call_id === 'call-1'), true);
  await assert.rejects(runProvider({ chatgptToken: 'test-access', model: 'test-model', endpoint: 'https://api.openai.com/v1/responses' }, 'hello', null, async () => ({}), { fetchImpl: async () => new Response('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n') }), /ended before completing/);
});
