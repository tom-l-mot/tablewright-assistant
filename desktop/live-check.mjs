import assert from 'node:assert/strict';
import { ChatGPTAuth } from '../companion/chatgpt-auth.mjs';
import { runProvider } from '../companion/provider.mjs';

export async function liveCheck({ store, fetchImpl = fetch }) {
  const auth = new ChatGPTAuth({ store, fetchImpl });
  await auth.init();
  const state = auth.status();
  assert.equal(state.accessState, 'ready', 'The account permits plan requests');
  assert.equal(state.model, 'gpt-5.6-luna', 'Luna is listed and selected');
  let requests = 0;
  const result = await runProvider({ chatgptToken: await auth.accessToken(), model: state.model, endpoint: 'https://api.openai.com/v1/responses' }, 'Connection test. Reply exactly TABLEWRIGHT_OK. Do not call tools or propose any world changes.', { level: 1, size: 4, threat: 'moderate' }, () => { throw new Error('World tools are disabled for this test.'); }, {
    fetchImpl: (url, options) => {
      assert.equal(++requests, 1, 'Only one AI request is authorized');
      return fetchImpl(url, options);
    }
  });
  assert.match(result.text, /TABLEWRIGHT_OK/);
  assert.deepEqual(result.planIds, []);
  return { inference: 'passed', requests, model: state.model, reasoning: { effort: 'high', mode: 'standard' }, worldWrites: 0 };
}
