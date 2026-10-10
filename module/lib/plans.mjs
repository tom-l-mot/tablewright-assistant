import { MODULE_ID, validateCreation } from './creation.mjs';
import { encounterXP } from './encounter.mjs';
import { escapeHTML, fail, safeError, stableJSON } from './validation.mjs';

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

function annotate(data, planId, stepId, kind, sourceUuid) {
  data._id = stepId;
  data.ownership = { default: 0 };
  data.flags ??= {};
  data.flags[MODULE_ID] = { planId, stepId, kind, sourceUuid };
  return data;
}

function actorData(source, name, background) {
  const data = structuredClone(source.data);
  data.name = name;
  if (background) {
    data.system.details.privateNotes = `${data.system.details.privateNotes ?? ''}<p>${escapeHTML(background).replace(/\n/g, '<br>')}</p>`;
  }
  return data;
}

export class PlanStore {
  #plans = new Map();
  #applying = null;

  constructor(adapter, newId, onChange = () => {}) {
    this.adapter = adapter;
    this.newId = newId;
    this.onChange = onChange;
  }

  list() {
    return [...this.#plans.keys()].map(id => this.get(id));
  }

  get(id) {
    const plan = this.#plans.get(id);
    if (!plan) fail('PLAN', 'The plan is not in this browser session.');
    return structuredClone({
      id, ...plan.request, state: plan.state, error: plan.error,
      sources: plan.sources.map((source, index) => ({ ...source.summary, quantity: plan.request.entries[index].quantity })),
      xp: plan.xp,
      steps: plan.steps.map(step => ({ id: step.id, documentName: step.documentName, name: step.data.name, sourceUuid: step.sourceUuid, receipt: plan.receipts[step.id] ?? null }))
    });
  }

  async propose(input) {
    this.adapter.requireGM();
    if (this.#plans.size >= 20) fail('LIMIT', 'This session has 20 plans. Refresh to start a new planning session.');
    const request = validateCreation(input);
    if (request.kind === 'encounter' && this.adapter.withoutLevel()) fail('VARIANT', 'Proficiency without level encounter math is unsupported.');
    const sources = await Promise.all(request.entries.map(entry => this.adapter.resolve(entry.uuid)));
    if (this.#plans.size >= 20) fail('LIMIT', 'This session has 20 plans. Refresh to start a new planning session.');
    const id = this.newId();
    const steps = [];
    const xp = request.kind === 'encounter' ? encounterXP(request.party, sources.map((source, index) => ({ ...source.summary, quantity: request.entries[index].quantity }))) : null;
    const add = (documentName, data, sourceUuid = null) => {
      const stepId = this.newId();
      steps.push({ id: stepId, documentName, sourceUuid, data: annotate(data, id, stepId, request.kind, sourceUuid) });
    };
    if (request.kind === 'shop') {
      const stockIds = new Map(sources.map(source => [source.raw._id, this.newId()]));
      if (stockIds.size !== sources.length) fail('SOURCE', 'Stock sources have conflicting item IDs. Choose sources from one pack.');
      const items = sources.map((source, index) => {
        const item = structuredClone(source.data);
        item._id = stockIds.get(source.raw._id);
        item.system.quantity = request.entries[index].quantity;
        if (item.system.containerId) {
          const containerId = stockIds.get(item.system.containerId);
          if (!containerId) fail('SOURCE', 'A stock item refers to a container that is not included in the plan.');
          item.system.containerId = containerId;
        }
        item.flags ??= {};
        item.flags[MODULE_ID] = { planId: id, sourceUuid: source.uuid };
        return item;
      });
      add('Actor', { name: request.name, type: 'loot', system: { lootSheetType: 'Merchant', hiddenWhenEmpty: false, details: { description: `<p>${escapeHTML(request.background).replace(/\n/g, '<br>')}</p>`, level: { value: 0 } } }, items });
    } else {
      for (let index = 0; index < sources.length; index++) {
        const source = sources[index];
        for (let copy = 0; copy < request.entries[index].quantity; copy++) {
          const name = request.kind === 'npc' ? request.name : `${source.summary.name}${request.entries[index].quantity > 1 ? ` ${copy + 1}` : ''}`;
          add('Actor', actorData(source, name, request.kind === 'npc' ? request.background : ''), source.uuid);
        }
      }
      if (request.kind === 'encounter') {
        const roster = xp.roster.map(creature => `<li>${escapeHTML(creature.name)}, level ${creature.level}, quantity ${creature.quantity}, ${creature.xp} XP. Source ${escapeHTML(creature.uuid)}.</li>`).join('');
        const actors = steps.map(step => `<li>${escapeHTML(step.data.name)}. Actor.${step.id}</li>`).join('');
        add('JournalEntry', { name: request.name, pages: [{ name: 'Encounter roster', type: 'text', text: { format: 1, content: `<h2>${escapeHTML(request.name)}</h2><p>${escapeHTML(request.background).replace(/\n/g, '<br>')}</p><p>Party level ${request.party.level}, ${request.party.size} PCs. Requested ${request.party.threat}, target ${xp.targetXP} XP. Actual ${xp.totalXP} XP, ${escapeHTML(xp.actualThreat)}.</p><ul>${roster}</ul><h3>Imported actors</h3><ul>${actors}</ul>` } }] });
      }
    }
    this.#plans.set(id, { request: freeze(request), sources: freeze(structuredClone(sources)), steps: freeze(steps), xp: xp && freeze(xp), state: 'pending', receipts: {}, error: null });
    this.onChange();
    return this.get(id);
  }

  reject(id) {
    this.adapter.requireGM();
    const plan = this.#plans.get(id);
    if (!plan || !['pending', 'partial'].includes(plan.state)) fail('PLAN', 'Only a pending or partial plan can be rejected.');
    plan.state = 'rejected';
    this.onChange();
    return this.get(id);
  }

  async approve(id) {
    this.adapter.requireGM();
    const plan = this.#plans.get(id);
    if (!plan) fail('PLAN', 'The plan is not in this browser session.');
    if (plan.state === 'complete') return this.get(id);
    if (this.#applying) fail('BUSY', 'Another approval is already running.');
    if (!['pending', 'partial'].includes(plan.state)) fail('PLAN', 'This plan cannot be approved.');
    this.#applying = id;
    plan.state = 'applying';
    plan.error = null;
    this.onChange();
    try {
      if (plan.request.kind === 'encounter' && this.adapter.withoutLevel()) fail('VARIANT', 'Proficiency without level encounter math is unsupported.');
      for (const source of plan.sources) {
        const current = await this.adapter.resolve(source.uuid);
        if (stableJSON(current.raw) !== stableJSON(source.raw)) fail('DRIFT', 'A compendium source changed after preview. Reject this plan and propose a new one.');
      }
      for (const step of plan.steps) {
        this.adapter.requireGM();
        let document = this.adapter.get(step.documentName, step.id);
        if (!document && plan.receipts[step.id]) fail('MISSING', 'A completed creation was removed. Reject this plan instead of recreating it.');
        if (!document) document = await this.adapter.create(step.documentName, structuredClone(step.data));
        const flags = document?.flags?.[MODULE_ID];
        if (document?.id !== step.id || flags?.planId !== id || flags?.stepId !== step.id) fail('CONFLICT', 'A planned ID is missing or belongs to another document. No further writes were attempted.');
        plan.receipts[step.id] = { id: document.id, uuid: document.uuid, name: String(document.name).slice(0, 100), documentName: step.documentName };
      }
      plan.state = 'complete';
    } catch (error) {
      plan.state = 'partial';
      plan.error = safeError(error);
    } finally {
      this.#applying = null;
      this.onChange();
    }
    return this.get(id);
  }
}
