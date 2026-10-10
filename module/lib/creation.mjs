import { fail, integer, object, text } from './validation.mjs';
import { validateParty } from './encounter.mjs';

export const MODULE_ID = 'pf2e-foundry-assistant';
export const PHYSICAL_TYPES = new Set(['armor', 'backpack', 'book', 'consumable', 'equipment', 'shield', 'treasure', 'weapon']);
export const UUID_PATTERN = '^Compendium\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.(Actor|Item)\\.[A-Za-z0-9]{16}$';

export function parseUUID(uuid) {
  if (typeof uuid !== 'string' || !new RegExp(UUID_PATTERN).test(uuid)) fail('SOURCE', 'Only canonical compendium Actor or Item UUIDs are accepted.');
  const [, namespace, pack, documentName, id] = uuid.split('.');
  return { packId: `${namespace}.${pack}`, documentName, id };
}

export function permittedPack(pack, extraPacks = []) {
  const metadata = pack?.metadata;
  return Boolean(metadata && ['Actor', 'Item'].includes(pack.documentName)
    && ((metadata.packageType === 'system' && metadata.packageName === 'pf2e')
      || (metadata.packageType === 'module' && extraPacks.includes(pack.collection))));
}

export function validateCreation(request) {
  object(request, ['kind', 'name', 'background', 'entries', 'party']);
  if (!['npc', 'shop', 'encounter'].includes(request.kind)) fail('INVALID', 'Choose npc, shop, or encounter.');
  text(request.name, 1, 100);
  if (!request.name.trim()) fail('INVALID', 'The name cannot be blank.');
  text(request.background, 0, 2000);
  if (!Array.isArray(request.entries) || !request.entries.length || request.entries.length > 12) fail('INVALID', 'Select between 1 and 12 compendium entries.');
  const entries = request.entries.map(entry => {
    object(entry, ['uuid', 'quantity']);
    const parsed = parseUUID(entry.uuid);
    if (parsed.documentName !== (request.kind === 'shop' ? 'Item' : 'Actor')) fail('SOURCE', 'The source document type does not match the plan kind.');
    integer(entry.quantity, 1, 20);
    return { uuid: entry.uuid, quantity: entry.quantity };
  });
  if (new Set(entries.map(entry => entry.uuid)).size !== entries.length) fail('INVALID', 'Combine quantities for duplicate sources.');
  if (entries.reduce((sum, entry) => sum + entry.quantity, 0) > 40) fail('INVALID', 'A plan is limited to 40 copies or stock units.');
  if (request.kind === 'npc' && (entries.length !== 1 || entries[0].quantity !== 1)) fail('INVALID', 'An NPC plan needs one source and one copy.');
  if (request.kind !== 'encounter' && request.party !== null) fail('INVALID', 'Party inputs apply only to encounters.');
  const party = request.kind === 'encounter' ? validateParty(request.party) : null;
  return { kind: request.kind, name: request.name.trim(), background: request.background, entries, party };
}

export const PARTY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['level', 'size', 'threat'],
  properties: { level: { type: 'integer', minimum: 1, maximum: 20 }, size: { type: 'integer', minimum: 1, maximum: 8 }, threat: { type: 'string', enum: ['trivial', 'low', 'moderate', 'severe', 'extreme'] } }
};
export const CREATION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kind', 'name', 'background', 'entries', 'party'],
  properties: {
    kind: { type: 'string', enum: ['npc', 'shop', 'encounter'] }, name: { type: 'string', minLength: 1, maxLength: 100 }, background: { type: 'string', maxLength: 2000 },
    entries: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['uuid', 'quantity'], properties: { uuid: { type: 'string', pattern: UUID_PATTERN }, quantity: { type: 'integer', minimum: 1, maximum: 20 } } } },
    party: { anyOf: [PARTY_SCHEMA, { type: 'null' }] }
  }
};
