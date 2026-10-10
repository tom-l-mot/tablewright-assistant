import test from 'node:test';
import assert from 'node:assert/strict';
import { encounterBudget, encounterXP } from '../module/lib/encounter.mjs';
import { validateCreation, parseUUID, permittedPack } from '../module/lib/creation.mjs';
import { getNestedValue, indexSummary } from '../module/lib/index-fields.mjs';

const uuid = 'Compendium.pf2e.bestiary.Actor.1234567890ABCDEF';
const npc = { kind: 'npc', name: 'Scout', background: '', entries: [{ uuid, quantity: 1 }], party: null };

test('PF2e thresholds include the low-threat adjustment of 20', () => {
  assert.deepEqual(['trivial', 'low', 'moderate', 'severe', 'extreme'].map(threat => encounterBudget({ level: 4, size: 4, threat })), [40, 60, 80, 120, 160]);
  assert.equal(encounterBudget({ level: 4, size: 5, threat: 'low' }), 80);
  assert.equal(encounterBudget({ level: 4, size: 3, threat: 'low' }), 40);
  const result = encounterXP({ level: 4, size: 4, threat: 'moderate' }, [{ level: 4, quantity: 2 }]);
  assert.equal(result.totalXP, 80);
  assert.equal(result.actualThreat, 'moderate');
  assert.throws(() => encounterXP({ level: 4, size: 4, threat: 'low' }, [{ level: 9, quantity: 1 }]), /level difference/);
  assert.throws(() => encounterBudget({ level: 4, size: 4, threat: 'low', proficiencyWithoutLevel: true }), /unknown fields/);
});

test('bounded structured requests reject unknown data and invalid copies', () => {
  assert.deepEqual(validateCreation(npc), npc);
  for (const change of [{ data: {} }, { name: '' }, { kind: 'macro' }, { party: {} }, { entries: [{ uuid, quantity: 0 }] }, { entries: [{ uuid: 'Actor.1234567890ABCDEF', quantity: 1 }] }]) {
    assert.throws(() => validateCreation({ ...npc, ...change }));
  }
  assert.throws(() => validateCreation({ ...npc, entries: [{ uuid, quantity: 2 }] }), /one copy/);
  assert.throws(() => validateCreation({ ...npc, kind: 'shop' }), /type/);
  assert.throws(() => validateCreation({ ...npc, kind: 'encounter', party: null }));
  assert.throws(() => validateCreation({ ...npc, kind: 'encounter', entries: [npc.entries[0], npc.entries[0]], party: { level: 4, size: 4, threat: 'low' } }), /duplicate/);
  assert.equal(parseUUID(uuid).packId, 'pf2e.bestiary');
});

test('pack policy allows PF2e system packs and explicitly configured module packs', () => {
  const pack = { collection: 'pf2e.bestiary', documentName: 'Actor', metadata: { packageType: 'system', packageName: 'pf2e' } };
  assert.equal(permittedPack(pack), true);
  assert.equal(permittedPack({ ...pack, documentName: 'Macro' }), false);
  assert.equal(permittedPack({ ...pack, metadata: { packageType: 'world', packageName: 'pf2e' } }, ['pf2e.bestiary']), false);
  assert.equal(permittedPack({ ...pack, metadata: { packageType: 'system', packageName: 'other' } }), false);
  const modulePack = { ...pack, collection: 'custom.npcs', metadata: { packageType: 'module', packageName: 'custom' } };
  assert.equal(permittedPack(modulePack), false);
  assert.equal(permittedPack(modulePack, ['custom.npcs']), true);
});

test('index summary accepts flat and nested Foundry fields without loading full documents', () => {
  const nested = { _id: '1234567890ABCDEF', name: 'Scout', type: 'npc', system: { details: { level: { value: 3 } }, traits: { value: ['human'] } } };
  const flat = { ...nested, 'system.details.level.value': 5 };
  assert.equal(getNestedValue(flat, 'system.details.level.value'), 5);
  assert.equal(getNestedValue(nested, 'system.details.level.value'), 3);
  assert.equal(getNestedValue({ system: null }, 'system.level.value'), undefined);
  assert.equal(getNestedValue(nested, ''), undefined);
  assert.equal(indexSummary(flat, { collection: 'pf2e.bestiary', documentName: 'Actor' }).level, 5);
  assert.equal(indexSummary(nested, { collection: 'pf2e.bestiary', documentName: 'Actor' }).uuid, uuid);
});
