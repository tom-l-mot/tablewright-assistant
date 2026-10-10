import { approveFromClick, windowMarkup } from './ui.mjs';
import { safeError } from '../lib/validation.mjs';

export function createWindow(adapter, plans, connection) {
  return new class AssistantWindow extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = { id: 'pf2e-foundry-assistant', tag: 'div', classes: ['pf2e-assistant'], window: { title: 'PF2e assistant', resizable: true }, position: { width: 720, height: 720 } };

    constructor() {
      super();
      this.url = 'ws://127.0.0.1:33333/browser';
      this.promptText = '';
      this.party = { level: '', size: '', threat: 'moderate' };
      this.response = '';
      this.status = 'Disconnected. Start the local companion, then enter its pairing token.';
      this.busy = false;
      this.focusId = 'assistant-prompt';
    }

    refresh() {
      return this.render({ force: true }).catch(error => ui.notifications.error(safeError(error).message));
    }

    async show(prompt = '') {
      adapter.requireGM();
      if (prompt) this.promptText = prompt;
      this.focusId = 'assistant-prompt';
      await this.refresh();
    }

    capture() {
      const element = this.element;
      if (!element) return;
      this.promptText = element.querySelector('#assistant-prompt')?.value ?? this.promptText;
      this.party = { level: element.querySelector('#assistant-level')?.value ?? this.party.level, size: element.querySelector('#assistant-size')?.value ?? this.party.size, threat: element.querySelector('#assistant-threat')?.value ?? this.party.threat };
      this.url = element.querySelector('#assistant-url')?.value ?? this.url;
    }

    async run(action) {
      if (this.busy) return;
      this.capture();
      this.busy = true;
      this.status = 'Working. Review any new plan before approving it.';
      await this.refresh();
      try { await action(); }
      catch (error) { this.status = safeError(error).message; }
      finally { this.capture(); this.busy = false; this.focusId = 'assistant-status'; await this.refresh(); }
    }

    async _renderHTML() {
      const result = document.createElement('div');
      result.innerHTML = windowMarkup({ url: this.url, prompt: this.promptText, party: this.party, response: this.response, status: this.status, busy: this.busy, connectionState: connection.state, providerConfigured: connection.providerConfigured, plans: plans.list() });
      return result;
    }

    _replaceHTML(result, content) { content.replaceChildren(result); }

    _onRender(context, options) {
      super._onRender(context, options);
      const element = this.element;
      element.querySelector('[data-form="connection"]').addEventListener('submit', event => {
        event.preventDefault();
        const tokenInput = element.querySelector('#assistant-token');
        const token = tokenInput.value;
        const endpoint = element.querySelector('#assistant-url').value;
        tokenInput.value = '';
        void this.run(async () => { await connection.connect(endpoint, token); this.status = 'Connected. MCP can propose plans. Review and approve them here.'; });
      });
      element.querySelector('[data-form="prompt"]').addEventListener('submit', event => {
        event.preventDefault();
        this.capture();
        const prompt = this.promptText;
        const party = { level: Number(this.party.level), size: Number(this.party.size), threat: this.party.threat };
        void this.run(async () => { const result = await connection.prompt(prompt, party); this.response = result.text; this.status = 'Model request finished. Review the source records and planned documents.'; });
      });
      for (const button of element.querySelectorAll('[data-action]')) button.addEventListener('click', event => {
        const action = button.dataset.action;
        if (action === 'disconnect') {
          connection.disconnect();
          this.status = 'Disconnected. Pending plans remain in this browser session.';
          void this.refresh();
        } else if (action === 'approve') {
          void this.run(async () => { const result = await approveFromClick(event, button.dataset.plan, plans); this.status = result.state === 'complete' ? 'Approved creations complete. The results below identify each document.' : result.error.message; });
        } else if (action === 'reject') {
          void this.run(async () => { plans.reject(button.dataset.plan); this.status = 'Plan rejected. Completed imports remain in the world.'; });
        }
      });
      if (this.focusId) { element.querySelector(`#${this.focusId}`)?.focus(); this.focusId = null; }
    }
  }();
}
