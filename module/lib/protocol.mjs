import { CREATION_SCHEMA, parseUUID, validateCreation } from './creation.mjs';
import { fail, integer, object, text } from './validation.mjs';

export const MAX_FRAME = 262144;
export const MAX_BODY = 32768;
const schema = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
export const TOOLS = Object.freeze([
  { name: 'connection_status', description: 'Read the selected local browser connection. This never approves or imports.', inputSchema: schema({}) },
  { name: 'world_context', description: 'Read bounded world, party, and permitted-pack metadata. No journals or source text.', inputSchema: schema({}) },
  { name: 'search_compendium', description: 'Search names in permitted installed Actor or Item indexes. Returns metadata only.', inputSchema: schema({ query: { type: 'string', minLength: 1, maxLength: 100 }, documentName: { type: 'string', enum: ['Actor', 'Item', 'any'] }, limit: { type: 'integer', minimum: 1, maximum: 30 } }) },
  { name: 'read_source', description: 'Read metadata for one permitted canonical NPC or physical item UUID. No description, art, or raw document data.', inputSchema: schema({ uuid: { type: 'string', maxLength: 180 } }) },
  { name: 'propose_creation', description: 'Propose an NPC, stocked merchant, or encounter using canonical UUIDs. Foundry resolves and previews it. A later GM browser click is required for every write.', inputSchema: schema({ request: CREATION_SCHEMA }) },
  { name: 'get_plan', description: 'Read a browser-session plan preview and creation receipts. Does not apply it.', inputSchema: schema({ id: { type: 'string', minLength: 16, maxLength: 16 } }) }
]);
export const BROWSER_METHODS = TOOLS.filter(tool => tool.name !== 'connection_status').map(tool => tool.name);

export function validateTool(method, args) {
  if (!TOOLS.some(tool => tool.name === method)) fail('METHOD', 'This operation is not permitted.');
  switch (method) {
    case 'connection_status':
    case 'world_context':
      object(args, []);
      return args;
    case 'search_compendium':
      object(args, ['query', 'documentName', 'limit']);
      text(args.query, 1, 100);
      if (!args.query.trim()) fail('INVALID', 'Search text cannot be blank.');
      if (!['Actor', 'Item', 'any'].includes(args.documentName)) fail('INVALID', 'Choose Actor, Item, or any.');
      integer(args.limit, 1, 30);
      return { ...args, query: args.query.trim() };
    case 'read_source':
      object(args, ['uuid']);
      parseUUID(args.uuid);
      return args;
    case 'propose_creation':
      object(args, ['request']);
      return { request: validateCreation(args.request) };
    case 'get_plan':
      object(args, ['id']);
      if (typeof args.id !== 'string' || !/^[A-Za-z0-9]{16}$/.test(args.id)) fail('INVALID', 'The plan ID is invalid.');
      return args;
  }
}

export async function browserTool(adapter, plans, method, input) {
  const args = validateTool(method, input);
  if (!BROWSER_METHODS.includes(method)) fail('METHOD', 'This browser operation is not permitted.');
  adapter.requireGM();
  switch (method) {
    case 'world_context': return adapter.context();
    case 'search_compendium': return adapter.search(args);
    case 'read_source': return { source: (await adapter.resolve(args.uuid)).summary };
    case 'propose_creation': return plans.propose(args.request);
    case 'get_plan': return plans.get(args.id);
  }
}
