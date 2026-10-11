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
  const chatgpt = state.chatgpt ?? { signedIn: false, email: '', models: [], model: '' };
  const selectedProvider = state.providerChoice ?? 'chatgpt';
  const canSend = connected && !state.busy && (selectedProvider === 'chatgpt' ? chatgpt.signedIn && Boolean(chatgpt.model) && (!chatgpt.accessState || chatgpt.accessState === 'ready') : selectedProvider === 'api_key' && state.apiKeyConfigured);
  return `<section class="assistant-body" aria-label="Tablewright Assistant">
    <p id="assistant-status" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">${e(state.status)}</p>
    <form data-form="connection" autocomplete="off"><fieldset><legend>Desktop connection</legend>
      <p>Open Tablewright Connector on the GM's computer. Click Pair desktop, confirm the site and pairing code there, then click Connect desktop. Keep this Foundry tab open.</p>
      <p>Pairing code ${e(state.pairingCode || 'appears after you click Pair desktop')}.</p>
      <div class="assistant-actions"><button type="button" data-action="pair" ${connectionBusy || state.busy ? 'disabled' : ''}>Pair desktop</button><button type="submit" ${connectionBusy || state.busy ? 'disabled' : ''}>Connect desktop</button><button type="button" data-action="disconnect" ${connectionBusy && !state.busy ? '' : 'disabled'}>Disconnect</button></div>
    </fieldset></form>
    <section aria-label="ChatGPT account"><h2>ChatGPT account</h2>
      <p>${chatgpt.signedIn ? `Signed in as ${e(chatgpt.email || 'ChatGPT account')}.` : 'Sign in with ChatGPT to use an eligible ChatGPT plan without an API key.'}</p>
      <p>Plan access ${e(chatgpt.accessState || 'not checked')}. ${e(chatgpt.message || '')}</p>
      <p>${chatgpt.reasoningEffort === 'high' ? 'Reasoning effort High. Reasoning mode Standard.' : 'Choose a supported account model. No model or billing fallback is automatic.'}</p>
      ${chatgpt.accessState === 'disabled' ? `<button type="button" data-action="chatgpt-enable" ${connected && !state.busy ? '' : 'disabled'}>Enable ChatGPT plan usage</button>` : ''}
      ${chatgpt.accessState === 'usage_limited' || chatgpt.accessState === 'unavailable' ? `<button type="button" data-action="chatgpt-models" ${connected && !state.busy ? '' : 'disabled'}>Check access again</button>` : ''}
      ${chatgpt.signedIn ? `${chatgpt.models.length ? `<label for="assistant-model">Model</label><select id="assistant-model" ${state.busy ? 'disabled' : ''}>${!chatgpt.models.some(model => model.slug === chatgpt.model) ? '<option value="" selected disabled>Choose a listed model</option>' : ''}${chatgpt.models.map(model => `<option value="${e(model.slug)}" ${model.slug === chatgpt.model ? 'selected' : ''}>${e(model.name)}</option>`).join('')}</select>` : `<button type="button" data-action="chatgpt-models" ${state.busy ? 'disabled' : ''}>Retry loading models</button>`}<button type="button" data-action="chatgpt-begin" ${state.busy ? 'disabled' : ''}>Reconnect ChatGPT</button><button type="button" data-action="chatgpt-signout" ${state.busy ? 'disabled' : ''}>Sign out of ChatGPT</button>` : `<button type="button" data-action="chatgpt-begin" ${connected && !state.busy ? '' : 'disabled'}>Continue with ChatGPT</button>${chatgpt.email ? `<button type="button" data-action="chatgpt-other" ${connected && !state.busy ? '' : 'disabled'}>Use another ChatGPT account</button>` : ''}`}
      ${state.authUrl ? `<p><a href="${e(state.authUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open ChatGPT sign-in</a>, then return to Foundry.</p>` : ''}
      <button type="button" data-action="chatgpt-cancel" ${connected && !state.busy ? '' : 'disabled'}>Cancel sign-in</button>
      <p><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">View ChatGPT usage and app limits</a></p>
    </section>
    <form data-form="prompt"><fieldset><legend>Request and encounter inputs</legend>
      <label for="assistant-provider">Model access and billing</label><select id="assistant-provider" name="provider" ${state.busy ? 'disabled' : ''}>
        <option value="chatgpt" ${selectedProvider === 'chatgpt' ? 'selected' : ''}>ChatGPT plan (shared limits)</option>
        ${state.apiKeyConfigured ? `<option value="api_key" ${selectedProvider === 'api_key' ? 'selected' : ''}>API key (separate API billing)</option>` : ''}
      </select><p>${selectedProvider === 'api_key' ? 'This request uses the configured API key and separate API billing.' : 'This request uses your ChatGPT plan and its shared usage limits.'}</p>
      <label for="assistant-prompt">Request</label><textarea id="assistant-prompt" name="prompt" rows="3" maxlength="4000" required>${e(state.prompt)}</textarea>
      <div class="assistant-party"><div><label for="assistant-level">Party level</label><input id="assistant-level" name="level" type="number" min="1" max="20" value="${e(state.party.level)}" required></div><div><label for="assistant-size">Party size</label><input id="assistant-size" name="size" type="number" min="1" max="8" value="${e(state.party.size)}" required></div><div><label for="assistant-threat">Threat</label><select id="assistant-threat" name="threat">${['trivial', 'low', 'moderate', 'severe', 'extreme'].map(threat => `<option value="${threat}" ${threat === state.party.threat ? 'selected' : ''}>${threat}</option>`).join('')}</select></div></div>
      <p>Enter party values explicitly before sending. For encounters, Foundry computes XP from canonical creature levels. Encounters create actors and a journal for you to place.</p>
      <button type="submit" ${canSend ? '' : 'disabled'}>Send to model</button>
      <p>${connected && !canSend ? 'Sign in with ChatGPT and choose an available model before sending a request.' : 'The desktop connector sends requests. Review and approve world creations here.'}</p>
    </fieldset></form>
    <section aria-label="Provider response"><h2>Assistant response</h2><p class="assistant-response">${e(state.response || 'No model response yet.')}</p></section>
    <section aria-label="Creation plans"><h2>Review and approval</h2><p>Only your click on Approve or Retry creates documents. Rejecting a partial plan keeps completed imports. Refresh discards this session\'s pending plans and receipts.</p>${state.plans.length ? state.plans.map(plan => planMarkup(plan, state.busy)).join('') : '<p>No pending plans. Send a request or use a local MCP client.</p>'}</section>
  </section>`;
}
