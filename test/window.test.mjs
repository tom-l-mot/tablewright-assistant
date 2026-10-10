import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { fakeFoundry } from './fake-foundry.mjs';

const windowModule = process.env.ASSISTANT_TEST_WINDOW_MODULE ? pathToFileURL(process.env.ASSISTANT_TEST_WINDOW_MODULE).href : new URL('../module/scripts/window.mjs', import.meta.url).href;
const { createWindow } = await import(windowModule);

test('request completion preserves prompt and party edits entered while waiting', async () => {
  const fields = {
    '#assistant-prompt': { value: 'Original request' }, '#assistant-level': { value: '4' },
    '#assistant-size': { value: '4' }, '#assistant-threat': { value: 'moderate' },
    '#assistant-url': { value: 'ws://127.0.0.1:33333/browser' }
  };
  const previousFoundry = globalThis.foundry;
  class ApplicationStub {
    constructor() { this.element = { querySelector: selector => fields[selector] ?? null }; }
    async render() {
      fields['#assistant-prompt'].value = this.promptText;
      fields['#assistant-level'].value = this.party.level;
      fields['#assistant-size'].value = this.party.size;
      fields['#assistant-threat'].value = this.party.threat;
      return this;
    }
  }
  globalThis.foundry = { applications: { api: { ApplicationV2: ApplicationStub } } };
  try {
    const env = fakeFoundry();
    const app = createWindow(env.adapter, env.plans, { state: 'connected', providerConfigured: true });
    let finish;
    let started;
    const gate = new Promise(resolve => { finish = resolve; });
    const actionStarted = new Promise(resolve => { started = resolve; });
    const run = app.run(async () => { started(); await gate; });
    await actionStarted;
    fields['#assistant-prompt'].value = 'Next request typed while waiting';
    fields['#assistant-level'].value = '8';
    fields['#assistant-size'].value = '6';
    finish();
    await run;
    assert.equal(fields['#assistant-prompt'].value, 'Next request typed while waiting');
    assert.equal(app.promptText, 'Next request typed while waiting');
    assert.equal(fields['#assistant-level'].value, '8');
    assert.equal(fields['#assistant-size'].value, '6');
  } finally {
    if (previousFoundry === undefined) delete globalThis.foundry;
    else globalThis.foundry = previousFoundry;
  }
});
