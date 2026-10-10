import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../module/lib/creation.mjs';
import { browserTool } from '../module/lib/protocol.mjs';
import { fakeFoundry, actorUUID, npcRequest, encounterRequest, shopRequest } from './fake-foundry.mjs';

test('reads and proposals create no world documents and expose metadata only', async () => {
  const env = fakeFoundry();
  const context = await browserTool(env.adapter, env.plans, 'world_context', {});
  assert.equal(context.world.id, 'test-world');
  const source = await browserTool(env.adapter, env.plans, 'read_source', { uuid: actorUUID });
  assert.equal(source.source.level, 4);
  assert.equal(JSON.stringify(source).includes('Licensed'), false);
  assert.equal(JSON.stringify(source).includes('items'), false);
  const search = await browserTool(env.adapter, env.plans, 'search_compendium', { query: 'Scout', documentName: 'Actor', limit: 5 });
  assert.equal(search.results[0].uuid, actorUUID);
  await browserTool(env.adapter, env.plans, 'propose_creation', { request: npcRequest });
  assert.equal(env.writes.length, 0);
  await assert.rejects(browserTool(env.adapter, env.plans, 'approve', {}), /not permitted/);
  assert.equal(env.writes.length, 0);
});

test('NPC import preserves canonical embedded IDs and escapes the custom background', async () => {
  const env = fakeFoundry();
  const plan = await env.plans.propose(npcRequest);
  const result = await env.plans.approve(plan.id);
  assert.equal(result.state, 'complete');
  assert.equal(env.writes.length, 1);
  const data = env.writes[0].data;
  assert.equal(data.name, npcRequest.name);
  assert.equal(data.system.details.publicNotes, '<p>Licensed source text</p>');
  assert.equal(data.system.details.privateNotes.includes('<script>'), false);
  assert.equal(data.items[0]._id, 'BBBBBBBBBBBBBBBB');
  assert.equal(data.items[0].system.linkedItemId, data.items[1]._id);
  assert.equal(data.flags[MODULE_ID].sourceUuid, actorUUID);
  await env.plans.approve(plan.id);
  assert.equal(env.writes.length, 1);
});

test('shop creates one PF2e merchant with canonical quantity and source provenance', async () => {
  const env = fakeFoundry();
  const plan = await env.plans.propose(shopRequest);
  assert.equal(env.writes.length, 0);
  const result = await env.plans.approve(plan.id);
  assert.equal(result.state, 'complete');
  const data = env.writes[0].data;
  assert.equal(data.type, 'loot');
  assert.equal(data.system.lootSheetType, 'Merchant');
  assert.equal(data.items[0].system.quantity, 3);
  assert.equal(data.items[0].system.description.value, 'Licensed item text');
  assert.equal(data.items[0].flags[MODULE_ID].sourceUuid, shopRequest.entries[0].uuid);
  assert.equal(data.ownership.default, 0);
});

test('encounter computes actual XP, copies NPCs, and creates a GM-only journal last', async () => {
  const env = fakeFoundry();
  const plan = await env.plans.propose(encounterRequest);
  assert.equal(plan.xp.totalXP, 80);
  assert.equal(plan.xp.targetXP, 80);
  const result = await env.plans.approve(plan.id);
  assert.equal(result.state, 'complete');
  assert.deepEqual(env.writes.map(write => write.documentName), ['Actor', 'Actor', 'JournalEntry']);
  const journal = env.writes[2].data;
  assert.deepEqual(journal.ownership, { default: 0 });
  assert.equal(journal.pages[0].text.content.includes('quantity 2, 80 XP'), true);
  assert.equal(journal.pages[0].text.content.includes(`Actor.${plan.steps[0].id}`), true);
  assert.equal(journal.pages[0].text.content.includes('<script>'), false);
});

test('single-flight approval rejects overlapping writes', async () => {
  const env = fakeFoundry();
  let release;
  env.state.delay = new Promise(resolve => { release = resolve; });
  const plan = await env.plans.propose(npcRequest);
  const first = env.plans.approve(plan.id);
  await assert.rejects(env.plans.approve(plan.id), /already running/);
  release();
  assert.equal((await first).state, 'complete');
  assert.equal(env.writes.length, 1);
});

test('partial retry reconciles a committed creation after a lost response and only writes missing steps', async () => {
  const env = fakeFoundry();
  const plan = await env.plans.propose(encounterRequest);
  env.state.failAt = 2;
  env.state.failAfterWrite = true;
  const failed = await env.plans.approve(plan.id);
  assert.equal(failed.state, 'partial');
  assert.equal(env.writes.length, 2);
  assert.equal(failed.steps[0].receipt.id, plan.steps[0].id);
  assert.equal(failed.steps[1].receipt, null);
  env.state.failAt = null;
  const retried = await env.plans.approve(plan.id);
  assert.equal(retried.state, 'complete');
  assert.equal(env.writes.length, 3);
  assert.equal(new Set(env.writes.map(write => write.data._id)).size, 3);
});

test('approval rechecks GM identity, pack policy, source drift, and proficiency variant', async () => {
  for (const scenario of ['gm', 'pack', 'drift', 'variant']) {
    const env = fakeFoundry();
    const plan = await env.plans.propose(encounterRequest);
    if (scenario === 'gm') env.game.user.isGM = false;
    if (scenario === 'pack') env.game.packs.contents[0].metadata.packageName = 'other';
    if (scenario === 'drift') env.actorRaw.system.details.level.value = 5;
    if (scenario === 'variant') env.settings.variant = 'ProficiencyWithoutLevel';
    if (scenario === 'gm') await assert.rejects(env.plans.approve(plan.id), /current Foundry GM/);
    else assert.equal((await env.plans.approve(plan.id)).state, 'partial');
    assert.equal(env.writes.length, 0);
  }
});

test('unknown, noncanonical, wrong-type and disallowed sources cannot produce plans', async () => {
  const env = fakeFoundry();
  for (const uuid of [actorUUID.replace('1234567890ABCDEF', 'ZZZZZZZZZZZZZZZZ'), actorUUID.replace('pf2e.bestiary', 'world.private')]) {
    await assert.rejects(env.plans.propose({ ...npcRequest, entries: [{ uuid, quantity: 1 }] }));
  }
  env.actorRaw.type = 'character';
  await assert.rejects(env.plans.propose(npcRequest), /canonical NPC/);
  env.itemRaw.type = 'spell';
  await assert.rejects(env.plans.propose(shopRequest), /physical item/);
  assert.equal(env.writes.length, 0);
});

test('rejected plans and conflicting IDs cannot write', async () => {
  const env = fakeFoundry();
  const plan = await env.plans.propose(npcRequest);
  env.plans.reject(plan.id);
  await assert.rejects(env.plans.approve(plan.id), /cannot be approved/);
  const conflict = await env.plans.propose(npcRequest);
  env.actors.set(conflict.steps[0].id, { id: conflict.steps[0].id, flags: {} });
  assert.equal((await env.plans.approve(conflict.id)).error.code, 'CONFLICT');
  assert.equal(env.writes.length, 0);
});

test('merchant container links survive the real adapter creation options', async () => {
  const env = fakeFoundry();
  const containerId = 'DDDDDDDDDDDDDDDD';
  const containerUUID = `Compendium.pf2e.equipment.Item.${containerId}`;
  const container = { _id: containerId, name: 'Backpack', type: 'backpack', system: { quantity: 1, containerId: null }, flags: {} };
  env.documents.set(containerUUID, { documentName: 'Item', toObject: () => structuredClone(container) });
  env.itemRaw.system.containerId = containerId;
  const plan = await env.plans.propose({ ...shopRequest, entries: [...shopRequest.entries, { uuid: containerUUID, quantity: 1 }] });
  assert.equal((await env.plans.approve(plan.id)).state, 'complete');
  const items = env.writes[0].data.items;
  assert.equal(items[0].system.containerId, items[1]._id);
  assert.equal(items[0].system.quantity, 3);
});

test('installed PF2e Boolean proficiency variant blocks unsupported encounter math', async () => {
  const env = fakeFoundry();
  env.settings.variant = true;
  assert.equal(env.adapter.context().proficiencyWithoutLevel, true);
  await assert.rejects(env.plans.propose(encounterRequest), /without level/);
  env.settings.variant = false;
  const plan = await env.plans.propose(encounterRequest);
  assert.equal(plan.xp.totalXP, 80);
  env.settings.variant = 'unknown';
  assert.throws(() => env.adapter.context(), /not recognized/);
  assert.equal(env.writes.length, 0);
});
