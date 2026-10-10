// Adapted from Foundry API Bridge. See THIRD_PARTY_NOTICES for its MIT notice.
export function getNestedValue(obj, path) {
  if (path.length === 0) return undefined;
  if (Object.hasOwn(obj, path)) return obj[path];
  let current = obj;
  for (const part of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

export function indexSummary(entry, pack) {
  const level = getNestedValue(entry, 'system.details.level.value') ?? getNestedValue(entry, 'system.level.value');
  const traits = getNestedValue(entry, 'system.traits.value');
  return {
    uuid: `Compendium.${pack.collection}.${pack.documentName}.${entry._id ?? entry.id}`,
    name: String(entry.name ?? '').slice(0, 100), documentName: pack.documentName, type: String(entry.type ?? '').slice(0, 40),
    level: Number.isInteger(level) ? level : null,
    traits: Array.isArray(traits) ? traits.slice(0, 12).map(value => String(value).slice(0, 40)) : []
  };
}
