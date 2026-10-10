import { MODULE_ID } from '../module/lib/creation.mjs';
import { FoundryAdapter } from '../module/scripts/foundry-adapter.mjs';
import { PlanStore } from '../module/lib/plans.mjs';

export const actorUUID = 'Compendium.pf2e.bestiary.Actor.1234567890ABCDEF';
export const itemUUID = 'Compendium.pf2e.equipment.Item.ABCDEF1234567890';
export const npcRequest = { kind: 'npc', name: 'Town scout', background: '<script>alert(1)</script>', entries: [{ uuid: actorUUID, quantity: 1 }], party: null };
export const encounterRequest = { ...npcRequest, kind: 'encounter', name: 'Two scouts', entries: [{ uuid: actorUUID, quantity: 2 }], party: { level: 4, size: 4, threat: 'moderate' } };
export const shopRequest = { ...npcRequest, kind: 'shop', name: 'Supply shop', entries: [{ uuid: itemUUID, quantity: 3 }] };

export function fakeFoundry() {
  let sequence = 0;
  const actors = new Map();
  const journals = new Map();
  const documents = new Map();
  const writes = [];
  const settings = { extras: '', variant: 'ProficiencyWithLevel' };
  const actorRaw = { _id: '1234567890ABCDEF', name: 'Scout', type: 'npc', system: { details: { level: { value: 4 }, publicNotes: '<p>Licensed source text</p>', privateNotes: '' } }, items: [{ _id: 'BBBBBBBBBBBBBBBB', name: 'Bow', type: 'weapon', system: { quantity: 1, linkedItemId: 'CCCCCCCCCCCCCCCC' } }, { _id: 'CCCCCCCCCCCCCCCC', name: 'Arrow', type: 'consumable', system: { quantity: 10 } }], flags: {} };
  const itemRaw = { _id: 'ABCDEF1234567890', name: 'Rope', type: 'equipment', system: { level: { value: 0 }, quantity: 1, containerId: null, description: { value: 'Licensed item text' } }, flags: {} };
  for (const [uuid, raw] of [[actorUUID, actorRaw], [itemUUID, itemRaw]]) documents.set(uuid, { documentName: uuid.includes('.Actor.') ? 'Actor' : 'Item', toObject: () => structuredClone(raw) });
  const collection = (contents, map) => ({ contents, get: id => map.get(id), fromCompendium: document => { const data = document.toObject(); delete data._id; data.flags.core = { sourceId: document.documentName === 'Actor' ? actorUUID : itemUUID }; return data; } });
  const game = {
    user: { id: 'gm', isGM: true }, world: { id: 'test-world', title: 'Test world' }, system: { id: 'pf2e', version: '8.5.1' }, version: '14',
    settings: { get: (namespace, key) => namespace === MODULE_ID ? settings.extras : settings.variant },
    actors: collection([], actors), items: collection([], new Map()), journal: collection([], journals),
    packs: { contents: [
      { collection: 'pf2e.bestiary', documentName: 'Actor', metadata: { packageType: 'system', packageName: 'pf2e', label: 'Bestiary' }, getDocument: async id => documents.get(`Compendium.pf2e.bestiary.Actor.${id}`), getIndex: async () => new Map([[actorRaw._id, actorRaw]]) },
      { collection: 'pf2e.equipment', documentName: 'Item', metadata: { packageType: 'system', packageName: 'pf2e', label: 'Equipment' }, getDocument: async id => documents.get(`Compendium.pf2e.equipment.Item.${id}`), getIndex: async () => new Map([[itemRaw._id, itemRaw]]) }
    ] }
  };
  const state = { failAt: null, failAfterWrite: false, delay: null };
  const create = documentName => async data => {
    const index = writes.length + 1;
    if (state.delay) await state.delay;
    if (state.failAt === index && !state.failAfterWrite) throw new Error('simulated create failure');
    const document = { ...structuredClone(data), id: data._id, uuid: `${documentName}.${data._id}`, documentName };
    (documentName === 'Actor' ? actors : journals).set(data._id, document);
    writes.push({ documentName, data: structuredClone(data) });
    if (state.failAt === index && state.failAfterWrite) throw new Error('lost response after commit');
    return documentName === 'Actor' ? document : [document];
  };
  const adapter = new FoundryAdapter(game, { Actor: { create: create('Actor') }, JournalEntry: { create: create('JournalEntry') } });
  const plans = new PlanStore(adapter, () => String(++sequence).padStart(16, '0'));
  return { game, adapter, plans, actors, journals, documents, writes, settings, actorRaw, itemRaw, state };
}
