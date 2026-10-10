import { MODULE_ID, parseUUID, permittedPack, PHYSICAL_TYPES } from '../lib/creation.mjs';
import { fail, integer } from '../lib/validation.mjs';
import { indexSummary } from '../lib/index-fields.mjs';

export class FoundryAdapter {
  constructor(game, classes) {
    this.game = game;
    this.classes = classes;
  }

  requireGM() {
    if (!this.game.user?.isGM) fail('GM_ONLY', 'Only the current Foundry GM can use the assistant.');
    if (this.game.system.id !== 'pf2e') fail('SYSTEM', 'This alpha supports the PF2e system.');
  }

  packs() {
    const extras = this.game.settings.get(MODULE_ID, 'additionalPacks').split(',').map(id => id.trim()).filter(Boolean);
    return this.game.packs.contents.filter(pack => permittedPack(pack, extras)).slice(0, 64);
  }

  withoutLevel() {
    return this.game.settings.get('pf2e', 'proficiencyVariant') === 'ProficiencyWithoutLevel';
  }

  context() {
    this.requireGM();
    return {
      world: { id: this.game.world.id, title: String(this.game.world.title ?? '').slice(0, 100) },
      system: { id: this.game.system.id, version: this.game.system.version }, foundryVersion: this.game.version,
      proficiencyWithoutLevel: this.withoutLevel(),
      party: this.game.actors.contents.filter(actor => actor.type === 'character').slice(0, 20)
        .map(actor => ({ name: String(actor.name).slice(0, 100), level: actor.system.details.level.value })),
      packs: this.packs().map(pack => ({ id: pack.collection, label: String(pack.metadata.label).slice(0, 100), documentName: pack.documentName }))
    };
  }

  async search({ query, documentName, limit }) {
    this.requireGM();
    const results = [];
    for (const pack of this.packs()) {
      if (documentName !== 'any' && pack.documentName !== documentName) continue;
      const index = await pack.getIndex({ fields: ['type', 'system.details.level.value', 'system.level.value', 'system.traits.value'] });
      for (const entry of index.values()) {
        if (String(entry.name).toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
          results.push(indexSummary(entry, pack));
          if (results.length === limit) return { results };
        }
      }
    }
    return { results };
  }

  async resolve(uuid) {
    this.requireGM();
    const { packId, documentName, id } = parseUUID(uuid);
    const pack = this.packs().find(pack => pack.collection === packId);
    if (!pack || pack.documentName !== documentName) fail('SOURCE', 'The compendium is not permitted or has the wrong document type.');
    const document = await pack.getDocument(id);
    if (!document || document.documentName !== documentName) fail('SOURCE', 'The selected compendium document is missing or invalid.');
    const raw = document.toObject();
    if (documentName === 'Actor') {
      if (raw.type !== 'npc') fail('SOURCE', 'Only canonical NPC actors can be imported.');
      integer(raw.system?.details?.level?.value, -1, 25);
    } else if (!PHYSICAL_TYPES.has(raw.type)) {
      fail('SOURCE', 'Merchant stock must be a canonical physical item.');
    }
    const collection = documentName === 'Actor' ? this.game.actors : this.game.items;
    const data = collection.fromCompendium(document);
    return { uuid, raw, data, summary: indexSummary(raw, pack) };
  }

  get(documentName, id) {
    return (documentName === 'Actor' ? this.game.actors : this.game.journal).get(id);
  }

  async create(documentName, data) {
    this.requireGM();
    const result = await this.classes[documentName].create(data, { keepId: true, renderSheet: false });
    return Array.isArray(result) ? result[0] : result;
  }
}
