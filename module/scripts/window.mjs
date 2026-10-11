import { approveFromClick, windowMarkup } from './ui.mjs';
import { safeError } from '../lib/validation.mjs';

export function createWindow(adapter, plans, connection) {
  return new class AssistantWindow extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = { id: 'tablewright-assistant', tag: 'div', classes: ['tablewright-assistant'], window: { title: 'Tablewright Assistant', resizable: true }, position: { width: 720, height: 720 } };

    constructor() {
      super();
      this.url = 'ws://127.0.0.1:33333/browser';
      this.promptText = '';
      this.party = { level: '', size: '', threat: 'moderate' };
      this.response = '';
      this.authUrl = '';
      this.providerChoice = 'chatgpt';
      this.apiKeyChosen = false;
      this.status = 'Open Tablewright Connector, then click Pair desktop.';
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
      this.providerChoice = element.querySelector('#assistant-provider')?.value ?? this.providerChoice;
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
      result.innerHTML = windowMarkup({ url: this.url, pairingCode: connection.pairingChallenge?.slice(0, 8), prompt: this.promptText, party: this.party, response: this.response, status: this.status, busy: this.busy, connectionState: connection.state, providerConfigured: connection.providerConfigured, apiKeyConfigured: connection.apiKeyConfigured, providerChoice: this.providerChoice, chatgpt: connection.chatgpt, authUrl: this.authUrl, plans: plans.list() });
      return result;
    }

    _replaceHTML(result, content) { content.replaceChildren(result); }

    _onRender(context, options) {
      super._onRender(context, options);
      const element = this.element;
      element.querySelector('[data-form="connection"]').addEventListener('submit', event => {
        event.preventDefault();
        void this.run(async () => { await connection.connect(); this.status = 'Desktop connected. Continue with ChatGPT, then review and approve proposals here.'; });
      });
      element.querySelector('[data-form="prompt"]').addEventListener('submit', event => {
        event.preventDefault();
        this.capture();
        const prompt = this.promptText;
        const party = { level: Number(this.party.level), size: Number(this.party.size), threat: this.party.threat };
        void this.run(async () => { const result = await connection.prompt(prompt, party, this.providerChoice); this.response = result.text; this.status = 'Model request finished. Review the source records and planned documents.'; });
      });
      element.querySelector('#assistant-provider').addEventListener('change', event => {
        this.capture();
        this.providerChoice = event.currentTarget.value;
        this.apiKeyChosen = this.providerChoice === 'api_key';
        this.status = this.apiKeyChosen ? 'Selected API key with separate API billing.' : 'Selected ChatGPT plan usage.';
        void this.refresh();
      });
      element.querySelector('#assistant-model')?.addEventListener('change', event => {
        const model = event.currentTarget.value;
        void this.run(async () => { await connection.selectChatGPTModel(model); this.status = 'ChatGPT model selected.'; });
      });
      for (const button of element.querySelectorAll('[data-action]')) button.addEventListener('click', event => {
        const action = button.dataset.action;
        if (action === 'pair') {
          try {
            globalThis.location.assign(connection.pairingURL());
            this.status = 'Confirm the matching site and pairing code in Tablewright Connector, then click Connect desktop within two minutes.';
            void this.refresh();
          } catch (error) { this.status = safeError(error).message; void this.refresh(); }
        } else if (action === 'disconnect') {
          connection.disconnect();
          this.status = 'Disconnected. Pending plans remain in this browser session.';
          void this.refresh();
        } else if (action === 'chatgpt-begin') {
          void this.run(async () => { this.authUrl = await connection.beginChatGPT(); this.status = 'Authorize on OpenAI in your browser, then return to Foundry.'; });
        } else if (action === 'chatgpt-enable') {
          void this.run(async () => { this.authUrl = await connection.enableChatGPTUsage(); this.status = 'Allow ChatGPT plan usage on OpenAI, then return to Foundry.'; });
        } else if (action === 'chatgpt-cancel') {
          void this.run(async () => { await connection.cancelChatGPT(); this.authUrl = ''; this.status = 'Sign-in cancelled. You can start again.'; });
        } else if (action === 'chatgpt-other') {
          void this.run(async () => { this.authUrl = await connection.beginOtherChatGPT(); this.status = 'Open the ChatGPT sign-in link for another account, then return to Foundry.'; });
        } else if (action === 'chatgpt-models') {
          void this.run(async () => { await connection.loadChatGPTModels(); this.status = 'ChatGPT models loaded.'; });
        } else if (action === 'chatgpt-signout') {
          void this.run(async () => { const result = await connection.signOutChatGPT(); this.authUrl = ''; this.status = result.revoked ? 'Signed out of ChatGPT.' : 'Signed out locally. Remote session revocation was not confirmed; disconnect Tablewright in ChatGPT Settings.'; });
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
