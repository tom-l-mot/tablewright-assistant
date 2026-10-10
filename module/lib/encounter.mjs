import { fail, integer, object } from './validation.mjs';

export const THREATS = Object.freeze({ trivial: [40, 10], low: [60, 20], moderate: [80, 20], severe: [120, 30], extreme: [160, 40] });
const CREATURE_XP = [10, 15, 20, 30, 40, 60, 80, 120, 160];

export function validateParty(party) {
  object(party, ['level', 'size', 'threat']);
  integer(party.level, 1, 20);
  integer(party.size, 1, 8);
  if (!Object.hasOwn(THREATS, party.threat)) fail('INVALID', 'Choose a supported encounter threat.');
  return { ...party };
}

export function encounterBudget(party) {
  validateParty(party);
  const [base, adjustment] = THREATS[party.threat];
  return base + (party.size - 4) * adjustment;
}

export function encounterXP(party, creatures) {
  const targetXP = encounterBudget(party);
  const roster = creatures.map(({ level, quantity, name, uuid }) => {
    integer(level, -1, 25);
    integer(quantity, 1, 20);
    const relativeLevel = level - party.level;
    if (relativeLevel < -4 || relativeLevel > 4) fail('LEVEL_RANGE', 'A creature is outside the supported party level difference of -4 through +4.');
    const xpEach = CREATURE_XP[relativeLevel + 4];
    return { name, uuid, level, quantity, xpEach, xp: xpEach * quantity };
  });
  const totalXP = roster.reduce((sum, creature) => sum + creature.xp, 0);
  const thresholds = Object.keys(THREATS).map(threat => ({ threat, xp: encounterBudget({ ...party, threat }) })).sort((a, b) => a.xp - b.xp);
  const exact = thresholds.filter(target => target.xp === totalXP).map(target => target.threat);
  let actualThreat;
  if (exact.length) actualThreat = exact.join(' or ');
  else if (totalXP < encounterBudget({ ...party, threat: 'trivial' })) actualThreat = 'trivial';
  else if (totalXP > thresholds.at(-1).xp) actualThreat = 'above extreme';
  else {
    const upperIndex = thresholds.findIndex(target => target.xp > totalXP);
    actualThreat = `between ${thresholds[upperIndex - 1].threat} and ${thresholds[upperIndex].threat}`;
  }
  return { targetXP, totalXP, difference: totalXP - targetXP, actualThreat, roster };
}
