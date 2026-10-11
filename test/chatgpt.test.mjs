import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { WebSocket } from 'ws';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ChatGPTAuth, verifyChatGPTIdToken } from '../companion/chatgpt-auth.mjs';
import { chatgptStore } from '../companion/chatgpt-store.mjs';
import { runProvider } from '../companion/provider.mjs';
import { startCompanion } from '../companion/server.mjs';
import { BrowserConnection } from '../module/scripts/connection.mjs';
import { windowMarkup } from '../module/scripts/ui.mjs';
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
  const release = await store.lock();
  const probe = `import { chatgptStore } from ${JSON.stringify(new URL('../companion/chatgpt-store.mjs', import.meta.url).href)}; try { const release = await chatgptStore(process.argv[1]).lock(); process.stdout.write('acquired'); await release(); } catch { process.stdout.write('blocked'); }`;
  const checkOtherProcess = () => execFileSync(process.execPath, ['--input-type=module', '-e', probe, directory], { encoding: 'utf8' });
  assert.equal(checkOtherProcess(), 'blocked');
  await release();
  assert.equal(checkOtherProcess(), 'acquired');
});

test('ID token verification requires a signed expiration claim', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = () => new SignJWT({ sub: 'gm', nonce: 'fresh-nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_test');
  await assert.rejects(verifyChatGPTIdToken(await sign().sign(privateKey), 'oaiapp_test', 'fresh-nonce', keys), /exp/);
  assert.equal((await verifyChatGPTIdToken(await sign().setExpirationTime('1h').sign(privateKey), 'oaiapp_test', 'fresh-nonce', keys)).subject, 'gm');
});

test('issued client ID survives failed code exchange for returning authorization', async () => {
  const store = memoryCredentialStore();
  const auth = new ChatGPTAuth({ store, fetchImpl: async () => new Response('{}', { status: 400 }) });
  const redirect = 'http://127.0.0.1:33333/auth/callback';
  const first = new URL(await auth.begin(redirect));
  const callback = new URL(redirect);
  callback.searchParams.set('code', 'invalid-grant');
  callback.searchParams.set('state', first.searchParams.get('state'));
  callback.searchParams.set('client_id', 'oaiapp_issued');
  await assert.rejects(auth.callback(callback), /sign-in or renewal failed/);
  assert.equal((await store.load()).pendingClientId, 'oaiapp_issued');
  const retry = new URL(await auth.begin(redirect));
  assert.equal(retry.searchParams.get('client_id'), 'oaiapp_issued');
  assert.equal(retry.searchParams.has('agent_name_hint'), false);
});

test('another-account retry reuses its issued ID while returning sign-in keeps the saved account', async () => {
  const store = memoryCredentialStore();
  await store.save({ hostId: 'urn:uuid:00000000-0000-0000-0000-000000000001', account: { clientId: 'oaiapp_A', subject: 'account-A', email: 'a@example.test', models: [], model: '' } });
  let exchanges = 0;
  const revocations = [];
  const auth = new ChatGPTAuth({ store, fetchImpl: async (url, options) => {
    if (url.endsWith('/oauth/token')) return ++exchanges === 1 ? new Response('{}', { status: 400 }) : new Response(JSON.stringify(tokenResponse('B')));
    if (url.endsWith('/oauth/revoke')) { revocations.push(Object.fromEntries(new URLSearchParams(options.body))); return new Response(); }
    if (url.endsWith('/models')) return new Response(JSON.stringify(catalog));
    throw new Error(`Unexpected URL: ${url}`);
  }, verifyIdToken: async () => ({ subject: 'account-B', email: 'b@example.test' }) });
  const redirect = 'http://127.0.0.1:33333/auth/callback';
  const another = new URL(await auth.begin(redirect, true));
  assert.equal(another.searchParams.get('client_id'), 'dynamic_agent_client');
  const failed = new URL(redirect);
  failed.searchParams.set('code', 'invalid-grant');
  failed.searchParams.set('state', another.searchParams.get('state'));
  failed.searchParams.set('client_id', 'oaiapp_B');
  await assert.rejects(auth.callback(failed), /sign-in or renewal failed/);
  assert.equal((await store.load()).pendingClientId, 'oaiapp_B');

  const returning = new URL(await auth.begin(redirect));
  assert.equal(returning.searchParams.get('client_id'), 'oaiapp_A');
  assert.equal(returning.searchParams.get('login_hint'), 'a@example.test');
  const wrongAccount = new URL(redirect);
  wrongAccount.searchParams.set('code', 'wrong-account');
  wrongAccount.searchParams.set('state', returning.searchParams.get('state'));
  wrongAccount.searchParams.set('client_id', 'oaiapp_A');
  await assert.rejects(auth.callback(wrongAccount), /different account/);
  assert.deepEqual(revocations, [{ token: 'refresh-B', token_type_hint: 'refresh_token', client_id: 'oaiapp_A' }]);
  assert.equal((await store.load()).account.clientId, 'oaiapp_A');

  const retry = new URL(await auth.begin(redirect, true));
  assert.equal(retry.searchParams.get('client_id'), 'oaiapp_B');
  assert.equal(retry.searchParams.has('agent_name_hint'), false);
  assert.equal(retry.searchParams.has('login_hint'), false);
  assert.equal((await store.load()).account.clientId, 'oaiapp_A');
  const success = new URL(redirect);
  success.searchParams.set('code', 'good');
  success.searchParams.set('state', retry.searchParams.get('state'));
  success.searchParams.set('client_id', 'oaiapp_B');
  assert.deepEqual(await auth.callback(success), { signedIn: true, email: 'b@example.test', models: [{ slug: 'test-model', name: 'Test Model' }], model: 'test-model' });
  assert.equal((await store.load()).account.clientId, 'oaiapp_B');
  assert.equal((await store.load()).account.subject, 'account-B');
  assert.equal((await store.load()).pendingClientId, null);
});

test('sign-out invalidates a pending callback, including an in-flight code exchange', async () => {
  const store = memoryCredentialStore();
  let exchangeStarted;
  let finishExchange;
  const started = new Promise(resolve => { exchangeStarted = resolve; });
  const gate = new Promise(resolve => { finishExchange = resolve; });
  const auth = new ChatGPTAuth({ store, fetchImpl: async url => {
    if (url.endsWith('/oauth/token')) { exchangeStarted(); await gate; return new Response(JSON.stringify(tokenResponse('cancelled'))); }
    return new Response();
  }, verifyIdToken: async () => ({ subject: 'gm', email: 'gm@example.test' }) });
  const redirect = 'http://127.0.0.1:33333/auth/callback';
  const first = new URL(await auth.begin(redirect));
  const stale = new URL(redirect);
  stale.searchParams.set('code', 'stale');
  stale.searchParams.set('state', first.searchParams.get('state'));
  stale.searchParams.set('client_id', 'oaiapp_issued');
  await auth.signOut();
  await assert.rejects(auth.callback(stale), /expired or did not match/);
  const second = new URL(await auth.begin(redirect));
  const callback = new URL(redirect);
  callback.searchParams.set('code', 'in-flight');
  callback.searchParams.set('state', second.searchParams.get('state'));
  callback.searchParams.set('client_id', 'oaiapp_issued');
  const completion = auth.callback(callback);
  await started;
  await assert.rejects(auth.begin(redirect, true), /already in progress/);
  const signingOut = auth.signOut();
  finishExchange();
  await assert.rejects(completion, /cancelled/);
  await signingOut;
  assert.equal(auth.status().signedIn, false);
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

test('ChatGPT choice never falls through to separate API billing', async t => {
  const store = memoryCredentialStore();
  await store.save({ hostId: 'urn:uuid:test-host', account: { clientId: 'oaiapp_test', subject: 'gm', email: 'gm@example.test', models: [], model: '' } });
  let paidRequests = 0;
  const server = await startCompanion({ ...config, apiKey: 'fake-api-key', model: 'api-model' }, { credentialStore: store, fetchImpl: async () => {
    paidRequests++;
    return new Response(JSON.stringify({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'API response' }] }] }));
  } });
  t.after(() => server.close());
  const ws = await connectBrowser(server.port);
  t.after(() => ws.close());
  const party = { level: 1, size: 4, threat: 'low' };
  const first = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'prompt', id: 'chatgpt-choice', provider: 'chatgpt', prompt: 'hello', party }));
  const rejected = JSON.parse((await first)[0].toString());
  assert.equal(rejected.error.code, 'PROVIDER_CONFIG');
  assert.equal(paidRequests, 0);
  const state = { connectionState: 'connected', apiKeyConfigured: true, providerConfigured: true, chatgpt: { signedIn: false, email: 'gm@example.test', models: [], model: '' }, busy: false, url: 'ws://127.0.0.1:33333/browser', party, status: 'Ready', prompt: 'hello', response: '', plans: [] };
  assert.match(windowMarkup({ ...state, providerChoice: 'chatgpt' }), /<button type="submit" disabled>Send to model<\/button>/);
  assert.match(windowMarkup({ ...state, providerChoice: 'api_key' }), /<button type="submit"\s*>Send to model<\/button>/);
  const second = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'prompt', id: 'api-choice', provider: 'api_key', prompt: 'hello', party }));
  const allowed = JSON.parse((await second)[0].toString());
  assert.equal(allowed.result.text, 'API response');
  assert.equal(paidRequests, 1);
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
