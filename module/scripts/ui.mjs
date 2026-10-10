import { escapeHTML as e, fail } from '../lib/validation.mjs';

export function assistantCommand(message, isGM) {
  if (!isGM || typeof message !== 'string') return null;
  const match = message.trim().match(/^@assistant(?:\s+([\s\S]*))?$/i);
  return match ? { prompt: match[1]?.trim() ?? '' } : null;
}

export async function approveFromClick(event, id, plans) {
  if (!event.isTrusted) fail('APPROVAL', 'Approval requires a GM click in the Foundry assistant window.');
  return plans.approve(id);
}

function planMarkup(plan, busy) {
  const canApprove = ['pending', 'partial'].includes(plan.state) && !busy;
  const rows = plan.sources.map(source => `<tr><td>${e(source.name)}</td><td>${source.quantity}</td><td>${source.level ?? 'n/a'}</td><td><code>${e(source.uuid)}</code></td></tr>`).join('');
  const receipts = plan.steps.map(step => `<li>${e(step.documentName)} ${e(step.name)}. ${step.receipt ? `<code>${e(step.receipt.uuid)}</code>` : 'Pending creation.'}</li>`).join('');
  const xp = plan.xp ? `<p>Party level ${plan.party.level}, ${plan.party.size} PCs. Requested ${e(plan.party.threat)}, target ${plan.xp.targetXP} XP. Actual ${plan.xp.totalXP} XP, ${e(plan.xp.actualThreat)}.</p>` : '';
  return `<article class="assistant-plan" aria-labelledby="plan-${e(plan.id)}">
    <h3 id="plan-${e(plan.id)}">${e(plan.name)} <small>${e(plan.kind)}, ${e(plan.state)}</small></h3>
    <p class="assistant-background">${e(plan.background || 'No custom background.')}</p>${xp}
    <table><caption>Canonical sources resolved before preview</caption><thead><tr><th scope="col">Source</th><th scope="col">Quantity</th><th scope="col">Level</th><th scope="col">Compendium UUID</th></tr></thead><tbody>${rows}</tbody></table>
    <p>${plan.steps.length} planned documents. NPC imports retain canonical statistics and embedded items. Actors and encounter journals start with GM-only ownership.</p>
    <ul>${receipts}</ul>
    ${plan.error ? `<p role="alert">${e(plan.error.message)} Completed imports remain in the world. Retry creates only missing steps.</p>` : ''}
    <div class="assistant-actions"><button type="button" data-action="approve" data-plan="${e(plan.id)}" ${canApprove ? '' : 'disabled'}>${plan.state === 'partial' ? 'Retry missing creations' : 'Approve creations'}</button><button type="button" data-action="reject" data-plan="${e(plan.id)}" ${canApprove ? '' : 'disabled'}>Reject plan</button></div>
  </article>`;
}

export function windowMarkup(state) {
  const connected = state.connectionState === 'connected';
  const connectionBusy = state.connectionState !== 'disconnected';
  return `<section class="assistant-body" aria-label="PF2e assistant">
    <p id="assistant-status" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${e(state.status)}</p>
    <form data-form="connection" autocomplete="off"><fieldset><legend>Local companion connection</legend>
      <label for="assistant-url">WebSocket URL</label><input id="assistant-url" name="url" type="url" value="${e(state.url)}" required ${connectionBusy ? 'disabled' : ''}>
      <label for="assistant-token">Pairing token</label><input id="assistant-token" name="token" type="password" autocomplete="new-password" aria-describedby="assistant-token-help" ${connectionBusy ? 'disabled' : 'required'}>
      <p id="assistant-token-help">Use the companion token. The provider key stays in the local Node process. The token is held only for this connection.</p>
      <div class="assistant-actions"><button type="submit" ${connectionBusy || state.busy ? 'disabled' : ''}>Connect</button><button type="button" data-action="disconnect" ${connectionBusy && !state.busy ? '' : 'disabled'}>Disconnect</button></div>
    </fieldset></form>
    <form data-form="prompt"><fieldset><legend>Request and encounter inputs</legend>
      <label for="assistant-prompt">Request</label><textarea id="assistant-prompt" name="prompt" rows="3" maxlength="4000" required>${e(state.prompt)}</textarea>
      <div class="assistant-party"><div><label for="assistant-level">Party level</label><input id="assistant-level" name="level" type="number" min="1" max="20" value="${e(state.party.level)}" required></div><div><label for="assistant-size">Party size</label><input id="assistant-size" name="size" type="number" min="1" max="8" value="${e(state.party.size)}" required></div><div><label for="assistant-threat">Threat</label><select id="assistant-threat" name="threat">${['trivial', 'low', 'moderate', 'severe', 'extreme'].map(threat => `<option value="${threat}" ${threat === state.party.threat ? 'selected' : ''}>${threat}</option>`).join('')}</select></div></div>
      <p>Enter party values explicitly before sending. For encounters, Foundry computes XP from canonical creature levels. Scene placement and combat activation are outside this alpha.</p>
      <button type="submit" ${connected && state.providerConfigured && !state.busy ? '' : 'disabled'}>Send to configured model</button>
      <p>${connected && !state.providerConfigured ? 'Connected for MCP planning. No paid provider is configured.' : 'MCP clients can search and propose through this same connection.'}</p>
    </fieldset></form>
    <section aria-label="Provider response"><h2>Assistant response</h2><p class="assistant-response">${e(state.response || 'No model response yet.')}</p></section>
    <section aria-label="Creation plans"><h2>Review and approval</h2><p>Only your click on Approve or Retry creates documents. Rejecting a partial plan keeps completed imports. Refresh discards this session\'s pending plans and receipts.</p>${state.plans.length ? state.plans.map(plan => planMarkup(plan, state.busy)).join('') : '<p>No pending plans. Send a request or use a local MCP client.</p>'}</section>
  </section>`;
}
