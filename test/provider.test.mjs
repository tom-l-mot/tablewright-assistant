import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { startCompanion } from '../companion/server.mjs';
import { runProvider } from '../companion/provider.mjs';
import { config, fakeGM } from './transport-fixture.mjs';
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
  const server = await startCompanion({ ...config, apiKey: key, model: 'fake-responses-model', endpoint: provider.endpoint });
  t.after(() => server.close());
  const gm = await fakeGM(server.port);
  const resultMessage = new Promise(resolve => gm.ws.on('message', raw => { const value = JSON.parse(raw.toString()); if (value.type === 'prompt_result') resolve(value); }));
  gm.ws.send(JSON.stringify({ type: 'prompt', id: 'prompt1', prompt: 'Propose a scout NPC.', party: { level: 4, size: 4, threat: 'moderate' } }));
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
