export function parsePairing(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid pairing link.');
  const url = new URL(value);
  const fields = ['origin', 'challenge', 'worldId', 'userId', 'systemId'];
  if (url.protocol !== 'tablewright:' || url.hostname !== 'pair' || url.pathname || url.username || url.password || url.port || url.hash || [...url.searchParams.keys()].some(key => !fields.includes(key)) || fields.some(key => url.searchParams.getAll(key).length !== 1)) throw new Error('Invalid pairing link.');
  const request = Object.fromEntries(url.searchParams);
  const origin = new URL(request.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== request.origin || origin.username || origin.password || !/^[a-f0-9]{64}$/.test(request.challenge) || request.systemId !== 'pf2e' || [request.worldId, request.userId].some(value => !value || value.length > 100 || /[\x00-\x1f\x7f]/.test(value))) throw new Error('Invalid Foundry pairing request.');
  return request;
}
