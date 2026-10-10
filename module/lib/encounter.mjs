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
  let actualThreat = 'below trivial';
  for (const threat of Object.keys(THREATS)) {
    if (totalXP >= encounterBudget({ ...party, threat })) actualThreat = threat;
  }
  if (totalXP > encounterBudget({ ...party, threat: 'extreme' })) actualThreat = 'above extreme';
  return { targetXP, totalXP, difference: totalXP - targetXP, actualThreat, roster };
}
