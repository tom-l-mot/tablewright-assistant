import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { startCompanion } from '../companion/server.mjs';
import { runProvider } from '../companion/provider.mjs';
import { safeError } from '../module/lib/validation.mjs';
import { config, fakeGM, memoryCredentialStore } from './transport-fixture.mjs';
import { npcRequest, actorUUID } from './fake-foundry.mjs';

const key = 'not-a-real-provider-secret-DO-NOT-SEND-TO-BROWSER';
const functionCall = (id, name, args) => ({ type: 'function_call', id: `fc_${id}`, call_id: `call_${id}`, name, arguments: JSON.stringify(args), status: 'completed' });
const message = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });

async function providerFor(t, handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ body, authorization: req.headers.authorization });
    const value = handler(requests.length - 1, body);
    res.writeHead(value.status ?? 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { endpoint: `http://127.0.0.1:${server.address().port}/v1/responses`, requests };
}

test('actual Responses loop preserves reasoning and call outputs, proposes, and redacts the key', async t => {
  const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-reasoning-token' };
  const provider = await providerFor(t, turn => ({ body: { status: 'completed', output: [
    [reasoning, functionCall('1', 'world_context', {})],
    [functionCall('2', 'search_compendium', { query: 'Scout', documentName: 'Actor', limit: 5 }), functionCall('3', 'read_source', { uuid: actorUUID })],
    [functionCall('4', 'propose_creation', { request: npcRequest })],
    [message(`Review the plan in Foundry. ${key}`)]
  ][turn] } }));
  const server = await startCompanion({ ...config, apiKey: key, model: 'fake-responses-model', endpoint: provider.endpoint }, { credentialStore: memoryCredentialStore() });
  t.after(() => server.close());
  const gm = await fakeGM(server.port);
  const resultMessage = new Promise(resolve => gm.ws.on('message', raw => { const value = JSON.parse(raw.toString()); if (value.type === 'prompt_result') resolve(value); }));
  gm.ws.send(JSON.stringify({ type: 'prompt', id: 'prompt1', prompt: 'Propose a scout NPC.', party: { level: 4, size: 4, threat: 'moderate' }, provider: 'api_key' }));
  const result = await resultMessage;
  assert.equal(result.result.planIds.length, 1);
  assert.equal(result.result.text.includes(key), false);
  assert.equal(result.result.text.includes('[redacted]'), true);
  assert.equal(gm.writes.length, 0);
  assert.equal(provider.requests.length, 4);
  for (const request of provider.requests) {
    assert.equal(request.authorization, `Bearer ${key}`);
    assert.equal(request.body.model, 'fake-responses-model');
    assert.equal(request.body.store, false);
    assert.equal(JSON.stringify(request.body).includes('Licensed'), false);
    assert.equal(request.body.tools.some(tool => /approve|import|delete|macro/.test(tool.name)), false);
  }
  assert.deepEqual(provider.requests[1].body.input[1], reasoning);
  assert.equal(provider.requests[1].body.input.some(item => item.type === 'function_call_output' && item.call_id === 'call_1'), true);
  assert.equal(provider.requests[3].body.input.some(item => item.type === 'function_call_output' && item.call_id === 'call_4'), true);
  gm.ws.close();
});

test('provider failures do not echo server errors or credentials', async t => {
  const provider = await providerFor(t, () => ({ status: 401, body: { error: { message: `Invalid key ${key}` } } }));
  await assert.rejects(runProvider({ ...config, apiKey: key, model: 'fake', endpoint: provider.endpoint }, 'hello', { level: 4, size: 4, threat: 'low' }, async () => ({})), error => {
    assert.equal(error.message.includes(key), false);
    assert.equal(error.code, 'PROVIDER');
    return true;
  });
});

test('provider rejects unauthorized tools and stops bounded repeated calls', async () => {
  let routed = 0;
  let requests = 0;
  const fakeFetch = async (_url, options) => {
    requests++;
    const body = JSON.parse(options.body);
    if (requests === 2) assert.equal(body.input.at(-1).output.includes('not permitted'), true);
    return new Response(JSON.stringify({ output: [functionCall(requests, 'approve', {})] }));
  };
  await assert.rejects(runProvider({ ...config, apiKey: key, model: 'fake' }, 'hello', null, async () => { routed++; }, { fetchImpl: fakeFetch }), /turn limit/);
  assert.equal(requests, 8);
  assert.equal(routed, 0);
});

test('provider encounter proposals cannot change explicit GM party inputs', async () => {
  const request = { ...npcRequest, kind: 'encounter', party: { level: 10, size: 4, threat: 'severe' } };
  let routed = 0;
  let count = 0;
  const fakeFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (count++ === 0) return new Response(JSON.stringify({ output: [functionCall('party', 'propose_creation', { request })] }));
    assert.equal(body.input.at(-1).output.includes('explicit party inputs'), true);
    return new Response(JSON.stringify({ output: [message('Unable to change the selected party.')] }));
  };
  await runProvider({ ...config, apiKey: key, model: 'fake' }, 'Encounter', { level: 4, size: 4, threat: 'moderate' }, async () => { routed++; }, { fetchImpl: fakeFetch });
  assert.equal(routed, 0);
});

test('provider cancellation stops a wait for an outstanding Foundry tool', { timeout: 2000 }, async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10);
  let fetches = 0;
  const routed = [];
  try {
    await assert.rejects(runProvider({ ...config, apiKey: key, model: 'fake' }, 'Read the world', null, name => { routed.push(name); return new Promise(() => {}); }, {
      signal: controller.signal,
      fetchImpl: async () => { fetches++; return new Response(JSON.stringify({ output: [functionCall('cancel', 'world_context', {}), functionCall('later', 'propose_creation', { request: npcRequest })] })); }
    }), error => error.code === 'PROVIDER_TIMEOUT');
    assert.equal(fetches, 1);
    assert.deepEqual(routed, ['world_context']);
    await assert.rejects(runProvider({ ...config, apiKey: key, model: 'fake' }, 'Already cancelled', null, async name => { routed.push(name); }, { signal: controller.signal, fetchImpl: async () => new Response(JSON.stringify({ output: [functionCall('aborted', 'world_context', {})] })) }), error => error.code === 'PROVIDER_TIMEOUT');
    assert.deepEqual(routed, ['world_context']);
  } finally { clearTimeout(timer); }
});

const chatgptConfig = { chatgptToken: 'oauth-secret', apiKey: 'api-secret', model: 'gpt-5.6-luna', endpoint: 'https://api.openai.com/v1/responses' };
const stream = value => `data: ${JSON.stringify(value)}\n\n`;

test('Luna sends High standard on every public Responses turn without API fallback', async () => {
  const bodies = [];
  const result = await runProvider(chatgptConfig, 'hello', null, async () => ({}), { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer oauth-secret');
    const body = JSON.parse(options.body);
    bodies.push(body);
    return new Response(stream({ type: 'response.completed', response: { status: 'completed', output: bodies.length === 1 ? [functionCall('1', 'world_context', {})] : [message('Ready')] } }));
  } });
  assert.equal(result.text, 'Ready');
  assert.equal(bodies.length, 2);
  for (const body of bodies) assert.deepEqual(body.reasoning, { effort: 'high', mode: 'standard' });
  await runProvider({ ...chatgptConfig, model: 'other-listed-model' }, 'hello', null, async () => ({}), { fetchImpl: async (_url, options) => {
    assert.equal(Object.hasOwn(JSON.parse(options.body), 'reasoning'), false);
    return new Response(stream({ type: 'response.completed', response: { status: 'completed', output: [message('Ready')] } }));
  } });
  let requests = 0;
  await assert.rejects(runProvider({ ...chatgptConfig, endpoint: 'https://chatgpt.com/backend-api/codex/responses' }, 'hello', null, async () => ({}), { fetchImpl: async () => { requests++; } }), error => error.code === 'PROVIDER_CONFIG');
  assert.equal(requests, 0);
});

test('structured HTTP and stream usage failures preserve safe recovery metadata and never expose response bodies', async () => {
  const cases = [
    ['subscription_sharing_user_not_eligible', 403, 'ineligible'],
    ['subscription_sharing_usage_limit_exceeded', 429, 'usage_limited'],
    ['subscription_sharing_usage_unavailable', 503, 'unavailable'],
    ['subscription_sharing_user_unavailable', 503, 'unavailable'],
    ['subscription_sharing_unsupported_capability', 400, 'unavailable'],
    ['subscription_sharing_route_not_supported', 403, 'unavailable'],
    ['subscription_sharing_invalid_user', 401, 'unavailable'],
    ['chatpass_v2_scope_not_authorized', 403, 'disabled'],
    ['chatpass_v2_invalid_authorization_context', 403, 'disabled']
  ];
  for (const [code, status, accessState] of cases) {
    for (const streamed of [false, true]) {
      let requests = 0;
      const errorBody = { error: { code, message: 'Never expose oauth-secret or api-secret', param: 'reasoning.effort', secret: 'oauth-secret' } };
      await assert.rejects(runProvider(chatgptConfig, 'hello', null, async () => ({}), { fetchImpl: async () => {
        requests++;
        return new Response(streamed ? stream({ type: 'response.output_text.delta', delta: 'partial' }) + stream({ type: 'response.failed', response: errorBody }) : JSON.stringify(errorBody), { status: streamed ? 200 : status, headers: { 'x-request-id': 'req_safe' } });
      } }), error => {
        assert.equal(error.code, code);
        assert.equal(error.upstreamCode, code);
        assert.equal(error.status, streamed ? 200 : status);
        assert.equal(error.requestId, 'req_safe');
        assert.equal(error.param, 'reasoning.effort');
        assert.equal(error.accessState, accessState);
        assert.equal(error.bodyShape, 'error');
        assert.equal(error.message.length <= 200, true);
        assert.equal(JSON.stringify(error).includes('oauth-secret'), false);
        assert.equal(JSON.stringify(error).includes('api-secret'), false);
        assert.deepEqual(Object.keys(safeError(error)), ['code', 'message']);
        return true;
      });
      assert.equal(requests, 1);
    }
  }
});

test('admission detail errors retain HTTP status and request ID with bounded safe messages', async () => {
  for (const status of [401, 403, 503]) {
    await assert.rejects(runProvider(chatgptConfig, 'hello', null, async () => ({}), { fetchImpl: async () => new Response(JSON.stringify({ detail: `Do not expose oauth-secret ${'x'.repeat(1000)}` }), { status, headers: { 'x-request-id': 'req_admission' } }) }), error => {
      assert.equal(error.status, status);
      assert.equal(error.requestId, 'req_admission');
      assert.equal(error.bodyShape, 'detail');
      assert.equal(error.message.includes('oauth-secret'), false);
      assert.equal(error.message.length <= 200, true);
      assert.equal(error.upstreamCode, undefined);
      return true;
    });
  }
});

test('explicit stream errors fail safely and incomplete responses remain distinct from usage limits', async () => {
  await assert.rejects(runProvider(chatgptConfig, 'hello', null, async () => ({}), { fetchImpl: async () => new Response(stream({ type: 'error', code: 'subscription_sharing_usage_limit_exceeded', message: 'oauth-secret' })) }), error => error.code === 'subscription_sharing_usage_limit_exceeded');
  await assert.rejects(runProvider(chatgptConfig, 'hello', null, async () => ({}), { fetchImpl: async () => new Response(stream({ type: 'response.incomplete', response: { incomplete_details: { reason: 'oauth-secret' } } })) }), error => error.code === 'PROVIDER_INCOMPLETE' && !error.message.includes('oauth-secret'));
});
